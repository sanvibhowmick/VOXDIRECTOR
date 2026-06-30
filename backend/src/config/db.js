import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();
const { Pool } = pg;

export const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

export async function initDB() {
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