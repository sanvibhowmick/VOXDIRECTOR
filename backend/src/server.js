import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pg from 'pg';
import { scrubDocumentDebris } from './utils/scrubber.js';
import { createSlidingTriplets } from './utils/chunker.js';
import { startDispatcherDaemon } from './services/dispatcher.js';


dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const { Pool } = pg;

// Initialize PostgreSQL Connection Pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

app.use(cors());
app.use('/master_audiobooks', express.static('master_audiobooks'));
app.use(express.json({ limit: '50mb' })); // Large limit to accept full book texts

// Automatically verify database tables match our full pipeline requirements
async function initDB() {
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS book_chunks (
            id SERIAL PRIMARY KEY,
            book_title VARCHAR(255) NOT NULL,
            sequence_index INT NOT NULL,
            raw_sentence TEXT NOT NULL,
            context_window TEXT NOT NULL,
            assigned_emotion VARCHAR(50) DEFAULT 'pending',
            confidence_score FLOAT DEFAULT 0.0,
            status VARCHAR(50) DEFAULT 'queued',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            audio_path TEXT,
            target_sentence TEXT
        );
    `;
    try {
        await pool.query(createTableQuery);
        console.log("📊 PostgreSQL Database Connected & Tables Verified.");
    } catch (err) {
        console.error("❌ Database Initialization Error:", err.message);
    }
}

/**
 * ASYNC INGESTION ROUTE (HTTP 202 Ticket Pattern)
 * Instantly queues the manuscript and releases the browser connection.
 */
app.post('/api/process-book', async (req, res) => {
    const { title, raw_text } = req.body;

    if (!title || !raw_text) {
        return res.status(400).json({ error: "Please provide both 'title' and 'raw_text'." });
    }

    try {
        console.log(`📖 Received manuscript: "${title}". Scrubbing debris...`);
        const scrubbedText = scrubDocumentDebris(raw_text);

        console.log(`✂️ Generating sliding context triplets...`);
        const triplets = createSlidingTriplets(scrubbedText);

        console.log(`💾 Queuing ${triplets.length} chunks into PostgreSQL...`);
        
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const insertQuery = `
                INSERT INTO book_chunks (book_title, sequence_index, raw_sentence, target_sentence, context_window, status)
                VALUES ($1, $2, $3, $4, $5, $6)
            `;
            
            for (const chunk of triplets) {
                await client.query(insertQuery, [
                    title,
                    chunk.sequence_index,
                    chunk.raw_sentence,
                    chunk.target_sentence,
                    chunk.context_window,
                    chunk.status
                ]);
            }
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }

        console.log(`🎟️ Issued HTTP 202 Ticket for "${title}"!`);
        
        // Return 202 Accepted immediately to prevent browser 504 timeouts
        res.status(202).json({
            status: "accepted",
            message: "Manuscript successfully queued for background vocal rendering.",
            book_title: title,
            total_chunks: triplets.length,
            stream_url: `/api/status/${encodeURIComponent(title)}`
        });

    } catch (error) {
        console.error("❌ Ingestion Crash:", error);
        res.status(500).json({ error: "Internal Server Error during manuscript ingestion." });
    }
});

/**
 * REAL-TIME SSE PROGRESS ROUTE
 * Keeps a live network pipe open to stream rendering status to React.
 */
app.get('/api/status/:book_title', async (req, res) => {
    const bookTitle = decodeURIComponent(req.params.book_title);

    // 1. Mandatory SSE headers to prevent HTTP socket closure
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    console.log(`📡 [SSE Connected] Client listening to progress for: "${bookTitle}"`);

    const progressTimer = setInterval(async () => {
        const client = await pool.connect();
        try {
            // Count completed vs total chunks matching this exact book_title
            const { rows } = await client.query(`
                SELECT 
                    COUNT(*) FILTER (WHERE status = 'completed' OR status = 'archived') AS done,
                    COUNT(*) AS total
                FROM book_chunks 
                WHERE book_title = $1;
            `, [bookTitle]);

            const done = Number(rows[0].done);
            const total = Number(rows[0].total);
            const percent = total > 0 ? Math.floor((done / total) * 100) : 0;

            // SSE strict formatting: must start with "data: " and end with double newline
            const payload = JSON.stringify({ processed: done, total, percent, status: percent === 100 ? 'READY' : 'PROCESSING' });
            res.write(`data: ${payload}\n\n`);

            if (percent === 100 && total > 0) {
                console.log(`🏁 [SSE Terminated] Rendering complete for "${bookTitle}". Closing socket.`);
                clearInterval(progressTimer);
                res.end();
            }
        } catch (err) {
            console.error(`⚠️ [SSE Error] Database poll failed for "${bookTitle}":`, err.message);
        } finally {
            client.release();
        }
    }, 1000); // Poll DB and push status packet every 1 second

    // Memory Leak Protection: Kill database poller if the user closes their browser tab
    req.on('close', () => {
        console.log(`🔌 [SSE Client Disconnected] Stopped polling for: "${bookTitle}"`);
        clearInterval(progressTimer);
    });
});

app.listen(PORT, async () => {
    await initDB();
    startDispatcherDaemon();
    console.log(`🚀 Asynchronous Express API Server running on http://localhost:${PORT}`);
});