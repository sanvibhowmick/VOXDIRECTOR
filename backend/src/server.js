import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initDB } from './config/db.js';
import { startDispatcherDaemon } from './services/dispatcher.js';
import bookRoutes from './routes/bookRoutes.js';
import { fileURLToPath } from 'url';
import path from 'path';

dotenv.config();

// Safety nets for unhandled rejections to prevent container crash loops on cloud hosts
process.on('unhandledRejection', (reason) => {
    console.error('⚠️ Unhandled Rejection caught:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('⚠️ Uncaught Exception caught:', err);
});

const app = express();
const PORT = process.env.PORT || 5000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Global Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use('/master_audiobooks', express.static(path.join(__dirname, '../master_audiobooks')));

// Mount API Routes
app.use('/api', bookRoutes);

// Boot sequence
app.listen(PORT, async () => {
    await initDB();
    startDispatcherDaemon();
    console.log(`🚀 Binary Express Gateway running on http://localhost:${PORT}`);
});