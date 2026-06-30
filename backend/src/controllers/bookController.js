import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfLib = require('pdf-parse');

import { pool } from '../config/db.js';
import { scrubDocumentDebris } from '../utils/scrubber.js';
import { createSlidingTriplets } from '../utils/chunker.js';

export const processBook = async (req, res) => {
    const { title, voice } = req.body;
    const file = req.file;

    if (!file || !title) {
        return res.status(400).json({ error: "Please provide both a valid manuscript file and a book title." });
    }

    try {
        console.log(`📖 Intercepted file: "${file.originalname}" (${file.mimetype}). Extracting prose...`);
        let rawText = '';

        if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
            if (typeof pdfLib === 'function') {
                const pdfData = await pdfLib(file.buffer);
                rawText = pdfData.text;
            } else if (pdfLib.PDFParse) {
                const parser = new pdfLib.PDFParse({ data: file.buffer });
                const pdfResult = await parser.getText();
                rawText = typeof pdfResult === 'string' ? pdfResult : pdfResult?.text || '';
                if (typeof parser.destroy === 'function') await parser.destroy(); 
            } else {
                throw new Error("Unrecognized pdf-parse export structure.");
            }
        } else {
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
                    title, chunk.sequence_index, chunk.raw_sentence, 
                    chunk.target_sentence, chunk.context_window, chunk.status
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
};

export const getBookStatus = async (req, res) => {
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
};

export const cleanupBookFiles = async (req, res) => {
    const bookTitle = decodeURIComponent(req.params.bookTitle);
    
    try {
        const deleteQuery = 'DELETE FROM book_chunks WHERE book_title = $1';
        await pool.query(deleteQuery, [bookTitle]);
        console.log(`🗑️ DB Cleanup: Deleted all chunks for "${bookTitle}"`);
        
        const finalMp3Path = path.join(process.cwd(), 'master_audiobooks', `${bookTitle}.mp3`);
        if (fs.existsSync(finalMp3Path)) {
            fs.unlinkSync(finalMp3Path);
            console.log(`🗑️ File Cleanup: Deleted ${finalMp3Path}`);
        }
        
        res.status(200).json({ message: "Database chunks and final audio successfully deleted." });
    } catch (err) {
        console.error("❌ Cleanup error:", err);
        res.status(500).json({ error: "Failed to delete chunks and files." });
    }
};