import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Landing directory for stitched master audiobooks
const MASTER_DIR = path.resolve(__dirname, '../../master_audiobooks');
if (!fs.existsSync(MASTER_DIR)) {
    fs.mkdirSync(MASTER_DIR, { recursive: true });
}

// Mutex lock to prevent duplicate finalizer runs
const activeJobs = new Set();

export async function finalizeManuscript(pool, bookTitle) {
    if (activeJobs.has(bookTitle)) return;
    activeJobs.add(bookTitle);

    console.log(`\n🧵 [Finalizer] All chunks cleared for "${bookTitle}". Initiating Master Byte-Stitch...`);

    let client;
    try {
        client = await pool.connect();
        const { rows } = await client.query(`
            SELECT id, audio_path 
            FROM book_chunks 
            WHERE book_title = $1 AND status = 'completed' 
            ORDER BY sequence_index ASC;
        `, [bookTitle]);

        if (rows.length === 0) {
            console.warn(`⚠️ [Finalizer] Aborted: No completed chunks found for "${bookTitle}".`);
            return;
        }

        const masterPath = path.join(MASTER_DIR, `${bookTitle}.mp3`);
        const writeStream = fs.createWriteStream(masterPath);

        // Stitching tiny chunk files into the master stream is memory-safe
        for (const row of rows) {
            if (row.audio_path && fs.existsSync(row.audio_path)) {
                const buffer = fs.readFileSync(row.audio_path);
                writeStream.write(buffer);
            }
        }

        writeStream.end();

        await new Promise((resolve, reject) => {
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
        });

        console.log(`🎉 [Finalizer] Master MP3 stitched: ${masterPath}`);

        // --- 🆕 THE FREE TIER HACK: BYPASS SUPABASE STORAGE ---
        console.log(`☁️ [Finalizer] Bypassing Supabase payload limits. Using ephemeral Render disk...`);
        
        // Render automatically injects this URL (e.g., https://voxdirector-backend.onrender.com)
        // If it's missing (like when testing locally), we fallback to localhost
        const baseUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 3000}`;
        
        // Encode the filename so spaces don't break the URL
        const encodedFileName = encodeURIComponent(path.basename(masterPath));
        const downloadUrl = `${baseUrl}/master_audiobooks/${encodedFileName}`;

        console.log(`✅ [Finalizer] File ready! Temporary Free-Tier Link: ${downloadUrl}`);
        // -----------------------------------------------------------

        // Disk Cleanup: Delete the thousands of tiny chunk MP3s
        let swept = 0;
        for (const row of rows) {
            if (row.audio_path && fs.existsSync(row.audio_path)) {
                try {
                    fs.unlinkSync(row.audio_path);
                    swept++;
                } catch (e) {}
            }
        }
        console.log(`🧹 [Garbage Collection] Reclaimed disk space from ${swept} chunks.`);

        // --- 🆕 DB CLEANUP LOGIC (Single-Row Anchor Hack) ---
        // 1. Pick exactly ONE chunk to act as the "memory" of the book, and save the Render URL there.
        await client.query(`
            UPDATE book_chunks 
            SET status = 'archived', cloud_url = $2
            WHERE id = (
                SELECT id FROM book_chunks 
                WHERE book_title = $1 
                LIMIT 1
            );
        `, [bookTitle, downloadUrl]);

        // 2. Obliterate every other chunk for this book!
        const deleteRes = await client.query(`
            DELETE FROM book_chunks 
            WHERE book_title = $1 AND status != 'archived';
        `, [bookTitle]);

        console.log(`💥 [DB Cleanup] Obliterated ${deleteRes.rowCount} database rows for "${bookTitle}". Database is clean!`);
        // -----------------------------------------------------

    } catch (err) {
        console.error(`❌ [Finalizer Crash] Failed compiling "${bookTitle}":`, err.message);
    } finally {
        activeJobs.delete(bookTitle);
        if (client) client.release();
    }
}