import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Landing directory for stitched master audiobooks
const MASTER_DIR = path.resolve(__dirname, '../../master_audiobooks');
if (!fs.existsSync(MASTER_DIR)) {
    fs.mkdirSync(MASTER_DIR, { recursive: true });
}

// In-memory Mutex to prevent race-condition double stitching
const activeJobs = new Set();

/**
 * Compiles thousands of individual chunk MP3s into a single master download.
 * Executes hard-drive garbage collection upon successful compilation.
 */
export async function finalizeManuscript(pool, bookTitle) {
    if (activeJobs.has(bookTitle)) return;
    activeJobs.add(bookTitle);

    const safeTitle = bookTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    console.log(`\n🧵 [Finalizer] All chunks cleared for "${bookTitle}". Initiating Master Byte-Stitch...`);

    const client = await pool.connect();
    try {
        // Pull all rendered MP3 file paths strictly ordered by sentence index
        const { rows } = await client.query(`
            SELECT id, audio_path 
            FROM book_chunks 
            WHERE book_title = $1 AND status = 'completed' 
            ORDER BY sequence_index ASC;
        `, [bookTitle]);

        if (rows.length === 0) {
            console.warn(`⚠️ [Finalizer] Aborted: No completed audio chunks found for "${bookTitle}".`);
            return;
        }

        const masterPath = path.join(MASTER_DIR, `master_${safeTitle}.mp3`);
        const writeStream = fs.createWriteStream(masterPath);

        // Stream binary frames sequentially into the master MP3 (~15MB RAM footprint)
        for (const row of rows) {
            if (row.audio_path && fs.existsSync(row.audio_path)) {
                const buffer = fs.readFileSync(row.audio_path);
                writeStream.write(buffer);
            }
        }

        writeStream.end();

        // Hold execution until the OS kernel confirms the file is written to disk
        await new Promise((resolve, reject) => {
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
        });

        console.log(`🎉 [Finalizer] Master MP3 published: ${masterPath}`);

        // Hard Drive Garbage Collection: Sweep temporary chunk files off the drive
        let swept = 0;
        for (const row of rows) {
            if (row.audio_path && fs.existsSync(row.audio_path)) {
                try {
                    fs.unlinkSync(row.audio_path);
                    swept++;
                } catch (e) {}
            }
        }
        console.log(`🧹 [Garbage Collection] Reclaimed disk space from ${swept} temporary chunk files.`);

        // Flip DB rows to 'archived' so the Dispatcher daemon ignores them forever
        await client.query(`
            UPDATE book_chunks 
            SET status = 'archived' 
            WHERE book_title = $1;
        `, [bookTitle]);

    } catch (err) {
        console.error(`❌ [Finalizer Crash] Failed compiling "${bookTitle}":`, err.message);
    } finally {
        activeJobs.delete(bookTitle);
        client.release();
    }
}