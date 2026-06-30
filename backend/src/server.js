import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initDB } from './config/db.js';
import { startDispatcherDaemon } from './services/dispatcher.js';
import bookRoutes from './routes/bookRoutes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Global Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use('/master_audiobooks', express.static('master_audiobooks'));

// Mount API Routes
app.use('/api', bookRoutes);

// Boot sequence
app.listen(PORT, async () => {
    await initDB();
    startDispatcherDaemon();
    console.log(`🚀 Binary Express Gateway running on http://localhost:${PORT}`);
});