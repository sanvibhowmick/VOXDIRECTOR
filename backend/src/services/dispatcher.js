import dotenv from 'dotenv';
import fs from 'fs';
import { promises as fsPromises } from 'fs'; // 🆕 Required for concurrent non-blocking file writes
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../config/db.js';
import { finalizeManuscript } from './finalizer.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ML_WORKER_URL = process.env.ML_WORKER_URL;
const TTS_WORKER_URL = process.env.TTS_WORKER_URL;

// 🆕 Controlled batching to prevent overwhelming cloud TTS & ML workers
const BATCH_SIZE = 3;
const POLLING_INTERVAL_MS = 2000;

// 🆕 Retry policy for transient ML/TTS failures
const MAX_RETRIES = 3;
const RETRY_BACKOFF_BASE_MS = 5000; // 5s, 10s, 20s (exponential)

let isPolling = false;

const MASTER_DIR = path.resolve(__dirname, '../../master_audiobooks');
if (!fs.existsSync(MASTER_DIR)) fs.mkdirSync(MASTER_DIR, { recursive: true });

const TEMP_DIR = path.resolve(__dirname, '../../temp_audio');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

export function startDispatcherDaemon() {
    console.log(`⚡ VoxDirector Daemon online! Polling ${BATCH_SIZE} chunks at a time...`);

    setInterval(async () => {
        if (isPolling) return; // Prevent overlapping cycles if previous batch is still synthesizing
        isPolling = true;

        let client;
        try {
            client = await pool.connect();
            const { rows: chunks } = await client.query(`
                UPDATE book_chunks
                SET status = 'processing'
                WHERE id IN (
                    SELECT id FROM book_chunks
                    WHERE status = 'queued'
                      AND (retry_after IS NULL OR retry_after <= NOW())
                    ORDER BY sequence_index ASC
                    LIMIT $1
                    FOR UPDATE SKIP LOCKED
                )
                RETURNING id, book_title, sequence_index, context_window, raw_sentence, retry_count;
            `, [BATCH_SIZE]);

            if (chunks.length === 0) {
                // Sweep check: Ensure any finished books get finalized immediately
                const { rows: unfinalized } = await client.query(`
                    SELECT DISTINCT book_title 
                    FROM book_chunks 
                    WHERE status = 'completed'
                      AND book_title NOT IN (
                          SELECT DISTINCT book_title 
                          FROM book_chunks 
                          WHERE status NOT IN ('completed', 'dead_letter')
                      )
                      AND book_title NOT IN (
                          SELECT DISTINCT book_title 
                          FROM book_chunks 
                          WHERE status = 'archived' OR cloud_url IS NOT NULL
                      );
                `);

                for (const row of unfinalized) {
                    finalizeManuscript(pool, row.book_title);
                }
                return;
            }

            // 🚀 NEW: Concurrent execution fires all requests simultaneously!
            await Promise.all(
                chunks.map(async (chunk) => {
                    try {
                        // --- STOP 1: THE BRAIN ---
                        const mlRes = await fetch(`${ML_WORKER_URL}/predict`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ context_window: chunk.context_window })
                        });

                        if (!mlRes.ok) throw new Error(`Brain HTTP ${mlRes.status}`);
                        const mlData = await mlRes.json();
                        const wonEmotion = mlData.voice_profile;

                        // --- STOP 2: THE STUDIO ---
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

                        // --- SAVE BASE64 TO LOCAL DISK (Non-blocking) ---
                        const localAudioPath = path.join(TEMP_DIR, `chunk_${chunk.id}.mp3`);
                        await fsPromises.writeFile(localAudioPath, Buffer.from(ttsData.audio_base64, 'base64'));

                        // --- SEAL THE CHUNK ---
                        await client.query(`
                            UPDATE book_chunks 
                            SET assigned_emotion = $1, 
                                confidence_score = $2, 
                                audio_path = $3, 
                                status = 'completed' 
                            WHERE id = $4
                        `, [wonEmotion, mlData.confidence, localAudioPath, chunk.id]);

                        console.log(`🎯 Chunk [${chunk.id}] -> [${wonEmotion.toUpperCase()}] -> 🔊 Saved Locally!`);

                        // --- FINALIZER CHECK ---
                        // dead_letter chunks are terminal (retries exhausted) and must not
                        // block finalization forever — the book finalizes without that sentence.
                        const { rows: check } = await client.query(`
                            SELECT COUNT(*) AS remaining 
                            FROM book_chunks 
                            WHERE book_title = $1 
                              AND status NOT IN ('completed', 'archived', 'dead_letter');
                        `, [chunk.book_title]);

                        if (Number(check[0].remaining) === 0) {
                            finalizeManuscript(pool, chunk.book_title);
                        }

                    } catch (err) {
                        console.error(`❌ Relay dropped Chunk ${chunk.id} (attempt ${chunk.retry_count + 1}):`, err.message);

                        const nextRetryCount = chunk.retry_count + 1;

                        if (nextRetryCount < MAX_RETRIES) {
                            // 🔁 Transient failure: requeue with exponential backoff
                            const backoffMs = RETRY_BACKOFF_BASE_MS * Math.pow(2, chunk.retry_count);
                            await client.query(`
                                UPDATE book_chunks
                                SET status = 'queued',
                                    retry_count = $1,
                                    retry_after = NOW() + ($2 || ' milliseconds')::interval,
                                    last_error = $3
                                WHERE id = $4
                            `, [nextRetryCount, backoffMs, err.message, chunk.id]);
                        } else {
                            // ⚰️ Exhausted retries: terminal dead-letter state so it stops
                            // being reclaimed, and so it no longer blocks finalization.
                            console.error(`⚰️ Chunk ${chunk.id} exceeded ${MAX_RETRIES} retries — moved to dead_letter.`);
                            await client.query(`
                                UPDATE book_chunks
                                SET status = 'dead_letter',
                                    retry_count = $1,
                                    last_error = $2
                                WHERE id = $3
                            `, [nextRetryCount, err.message, chunk.id]);

                            // 🆕 Check if all remaining chunks are cleared and finalize
                            const { rows: check } = await client.query(`
                                SELECT COUNT(*) AS remaining 
                                FROM book_chunks 
                                WHERE book_title = $1 
                                  AND status NOT IN ('completed', 'archived', 'dead_letter');
                            `, [chunk.book_title]);

                            if (Number(check[0].remaining) === 0) {
                                finalizeManuscript(pool, chunk.book_title);
                            }
                        }
                    }
                })
            );

        } catch (e) {
            console.error("⚠️ Database polling hiccup:", e.message);
        } finally {
            if (client) client.release();
            isPolling = false;
        }
    }, POLLING_INTERVAL_MS);
}