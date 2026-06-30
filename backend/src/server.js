import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pg from 'pg';
import multer from 'multer';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfLib = require('pdf-parse');
import { scrubDocumentDebris } from './utils/scrubber.js';
import { createSlidingTriplets } from './utils/chunker.js';
import { startDispatcherDaemon } from './services/dispatcher.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

// Configure Multer to catch physical file buffers in RAM
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { 
        fileSize: 50 * 1024 * 1024,   // 50 MB limit for binary book files (req.file)
        fieldSize: 10 * 1024 * 1024   // 10 MB limit for form text fields (req.body)
    }
});

app.use(cors());
app.use('/master_audiobooks', express.static('master_audiobooks'));
app.use(express.json({ limit: '50mb' }));

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
 * BINARY INGESTION ROUTE (HTTP 202 Ticket Pattern)
 * Intercepts physical file buffers and extracts prose from PDF/TXT natively.
 */
app.post('/api/process-book', upload.single('file'), async (req, res) => {
    const { title, voice } = req.body;
    const file = req.file;

    if (!file || !title) {
        return res.status(400).json({ error: "Please provide both a valid manuscript file and a book title." });
    }

    try {
        console.log(`📖 Intercepted file: "${file.originalname}" (${file.mimetype}). Extracting prose...`);
        let rawText = '';

        // Universal PDF Extraction (Handles both v1 Legacy & v2 Class-based exports)
        if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
            if (typeof pdfLib === 'function') {
                // Legacy pdf-parse v1.x
                const pdfData = await pdfLib(file.buffer);
                rawText = pdfData.text;
            } else if (pdfLib.PDFParse) {
                // Modern pdf-parse v2.x
                const parser = new pdfLib.PDFParse({ data: file.buffer });
                const pdfResult = await parser.getText();
                rawText = typeof pdfResult === 'string' ? pdfResult : pdfResult?.text || '';
                if (typeof parser.destroy === 'function') {
                    await parser.destroy(); // Purge PDF worker threads from RAM
                }
            } else {
                throw new Error("Unrecognized pdf-parse export structure.");
            }
        } else {
            // Standard UTF-8 text extraction (.txt, etc.)
            rawText = file.buffer.toString('utf-8');
        }

        console.log(`🧹 Scrubbing debris from extracted text...`);
        const scrubbedText = scrubDocumentDebris(rawText);

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
        
        res.status(202).json({
            status: "accepted",
            message: "Manuscript successfully queued for background vocal rendering.",
            book_title: title,
            total_chunks: triplets.length,
            stream_url: `/api/status/${encodeURIComponent(title)}`
        });

    } catch (error) {
        console.error("❌ Ingestion Crash:", error);
        res.status(500).json({ error: "Internal Server Error during document parsing: " + error.message });
    }
});

app.get('/api/status/:book_title', async (req, res) => {
    const bookTitle = decodeURIComponent(req.params.book_title);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const progressTimer = setInterval(async () => {
        const client = await pool.connect();
        try {
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

            const payload = JSON.stringify({ processed: done, total, percent, status: percent === 100 ? 'READY' : 'PROCESSING' });
            res.write(`data: ${payload}\n\n`);

            if (percent === 100 && total > 0) {
                clearInterval(progressTimer);
                res.end();
            }
        } catch (err) {
            console.error(`⚠️ [SSE Error]:`, err.message);
        } finally {
            client.release();
        }
    }, 1000);

    req.on('close', () => clearInterval(progressTimer));
});

app.listen(PORT, async () => {
    await initDB();
    startDispatcherDaemon();
    console.log(`🚀 Binary Express Gateway running on http://localhost:${PORT}`);
});