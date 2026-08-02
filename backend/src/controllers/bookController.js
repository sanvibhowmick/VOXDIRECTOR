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
    
    const client = await pool.connect();
    try {
        const { rows } = await client.query(`
            SELECT 
                COUNT(*) FILTER (WHERE status = 'completed' OR status = 'archived') AS done,
                COUNT(*) FILTER (WHERE status = 'dead_letter') AS dead_letter,
                COUNT(*) AS total,
                MAX(cloud_url) as cloud_url
            FROM book_chunks 
            WHERE book_title = $1;
        `, [bookTitle]);

        const done = Number(rows[0].done);
        const deadLetter = Number(rows[0].dead_letter);
        const total = Number(rows[0].total);
        const cloudUrl = rows[0].cloud_url;

        // dead_letter chunks are terminal (retries exhausted) — they count toward
        // "finished processing" for progress purposes, same as the finalizer treats them.
        const finished = done + deadLetter;
        const percent = total > 0 ? Math.floor((finished / total) * 100) : 0;

        let status = 'processing';

        if (total > 0 && deadLetter === total) {
            // Every single chunk died — nothing to finalize, truly failed.
            status = 'failed';
        }
        else if (finished === total && !cloudUrl) {
            status = 'finalizing';
        }
        else if (finished === total && cloudUrl) {
            // Completed, but flag if some sentences were skipped so the UI/user
            // can be told the audiobook is missing a few lines instead of silently
            // shipping an incomplete file.
            status = deadLetter > 0 ? 'completed_with_errors' : 'completed';
        }

        res.json({
            processed: done,
            total,
            percent,
            status,
            cloudUrl,
            failed: deadLetter // kept as `failed` for frontend backward-compatibility
        });

    } catch (err) {
        console.error(`⚠️ Status check error:`, err.message);
        res.status(500).json({ error: "Failed to check status" });
    } finally {
        client.release();
    }
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