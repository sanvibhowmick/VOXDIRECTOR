import express from 'express';
import multer from 'multer';
import { processBook, getBookStatus, cleanupBookFiles } from '../controllers/bookController.js';

const router = express.Router();

// Configure Multer to catch physical file buffers in RAM
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { 
        fileSize: 50 * 1024 * 1024,   // 50 MB limit for binary book files
        fieldSize: 10 * 1024 * 1024   // 10 MB limit for text fields
    }
});

// Define API Endpoints
router.post('/process-book', upload.single('file'), processBook);
router.get('/status/:book_title', getBookStatus);
router.delete('/cleanup/:bookTitle', cleanupBookFiles);

export default router;