import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { finalizeManuscript } from './finalizer.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Catch random network drops so they don't crash the Node server
pool.on('error', (err, client) => {
    console.error('⚠️ Unexpected network error on idle client:', err.message);
});

const ML_WORKER_URL = process.env.ML_WORKER_URL;
const TTS_WORKER_URL = process.env.TTS_WORKER_URL;

// Master destination directory for finished entire book MP3s
const MASTER_DIR = path.resolve(__dirname, '../../master_audiobooks');
if (!fs.existsSync(MASTER_DIR)) fs.mkdirSync(MASTER_DIR, { recursive: true });

// Ensure local temp directory exists for intermediate chunks
const TEMP_DIR = path.resolve(__dirname, '../../temp_audio');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

export function startDispatcherDaemon() {
    console.log("⚡ VoxDirector Double-Relay Daemon online! Polling Supabase...");

    setInterval(async () => {
        const client = await pool.connect();
        try {
            // Atomic Claim Query matching your exact server.js column names
            const { rows: chunks } = await client.query(`
                UPDATE book_chunks
                SET status = 'processing'
                WHERE id IN (
                    SELECT id FROM book_chunks
                    WHERE status = 'queued'
                    ORDER BY sequence_index ASC
                    LIMIT 5
                    FOR UPDATE SKIP LOCKED
                )
                RETURNING id, book_title, sequence_index, context_window, raw_sentence;
            `);

            if (chunks.length === 0) return;

            for (const chunk of chunks) {
                try {
                    // --- STOP 1: THE BRAIN (Port 8000) ---
                    const mlRes = await fetch(`${ML_WORKER_URL}/predict`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ context_window: chunk.context_window })
                    });

                    if (!mlRes.ok) throw new Error(`Brain HTTP ${mlRes.status}`);
                    const mlData = await mlRes.json();
                    const wonEmotion = mlData.voice_profile;

                    // --- STOP 2: THE STUDIO (Port 8001) ---
                    const ttsRes = await fetch(`${TTS_WORKER_URL}/synthesize`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chunk_id: chunk.id,
                            text: chunk.raw_sentence,
                            emotion: wonEmotion
                        })
                    });

                    if (!ttsRes.ok) throw new Error(`Studio HTTP ${ttsRes.status}`);
                    const ttsData = await ttsRes.json();

                    // --- NEW: SAVE BASE64 TO LOCAL DISK ---
                    // Create the local file path and write the decoded bytes
                    const localAudioPath = path.join(TEMP_DIR, `chunk_${chunk.id}.mp3`);
                    fs.writeFileSync(localAudioPath, Buffer.from(ttsData.audio_base64, 'base64'));

                    // --- SEAL THE CHUNK ---
                    // Save the LOCAL path to the database, not the cloud path
                    await client.query(`
                        UPDATE book_chunks 
                        SET assigned_emotion = $1, 
                            confidence_score = $2, 
                            audio_path = $3, 
                            status = 'completed' 
                        WHERE id = $4
                    `, [wonEmotion, mlData.confidence, localAudioPath, chunk.id]);

                    console.log(`🎯 Chunk [${chunk.id}] -> [${wonEmotion.toUpperCase()}] -> 🔊 Transported & Saved Locally!`);

                    // --- FINALIZER CHECK ---
                    // Evaluates uncompleted chunks matching this exact book_title
                    const { rows: check } = await client.query(`
                        SELECT COUNT(*) AS remaining 
                        FROM book_chunks 
                        WHERE book_title = $1 AND status != 'completed' AND status != 'archived';
                    `, [chunk.book_title]);

                    if (Number(check[0].remaining) === 0) {
                        finalizeManuscript(pool, chunk.book_title);
                    }

                } catch (err) {
                    console.error(`❌ Relay dropped Chunk ${chunk.id}:`, err.message);
                    await client.query(`UPDATE book_chunks SET status = 'failed' WHERE id = $1`, [chunk.id]);
                }
            }
        } catch (e) {
            console.error("Database polling hiccup:", e.message);
        } finally {
            client.release();
        }
    }, 2500);
}