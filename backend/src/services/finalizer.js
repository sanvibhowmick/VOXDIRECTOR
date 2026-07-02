import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Supabase Storage Client
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const MASTER_DIR = path.resolve(__dirname, '../../master_audiobooks');
if (!fs.existsSync(MASTER_DIR)) {
    fs.mkdirSync(MASTER_DIR, { recursive: true });
}

const activeJobs = new Set();

export async function finalizeManuscript(pool, bookTitle) {
    if (activeJobs.has(bookTitle)) return;
    activeJobs.add(bookTitle);

    console.log(`\n🧵 [Finalizer] All chunks cleared for "${bookTitle}". Initiating Master Byte-Stitch...`);

    const client = await pool.connect();
    try {
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

        // --- NEW: STREAMING CLOUD UPLOAD LOGIC (Prevents RAM Crash!) ---
        console.log(`☁️ [Finalizer] Streaming master file to Supabase Storage...`);
        
        // Create a safe, web-friendly filename
        const safeName = bookTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const cloudFileName = `${safeName}_${Date.now()}.mp3`;

        // Use a ReadStream instead of readFileSync to stream the data like a garden hose
        const fileStream = fs.createReadStream(masterPath);

        const { data, error } = await supabase.storage
            .from('audiobooks') // Make sure this bucket is set to "Public" in Supabase!
            .upload(cloudFileName, fileStream, { 
                contentType: 'audio/mpeg',
                duplex: 'half' // Required by Node.js for streaming uploads
            });

        if (error) throw error;

        // Retrieve the permanent download URL
        const { data: publicUrlData } = supabase.storage
            .from('audiobooks')
            .getPublicUrl(cloudFileName);

        const permanentUrl = publicUrlData.publicUrl;
        console.log(`✅ [Finalizer] Upload complete! Permanent Link: ${permanentUrl}`);
        // -------------------------------

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

        // Flip DB rows to 'archived' AND attach the cloud URL!
        await client.query(`
            UPDATE book_chunks 
            SET status = 'archived', cloud_url = $2
            WHERE book_title = $1;
        `, [bookTitle, permanentUrl]);

    } catch (err) {
        console.error(`❌ [Finalizer Crash] Failed compiling "${bookTitle}":`, err.message);
    } finally {
        activeJobs.delete(bookTitle);
        client.release();
    }
}