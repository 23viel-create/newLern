'use strict';
const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { listBooks, deleteBook, BOOKS_DIR, SUPPORTED_EXTS } = require('../controllers/booksController');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    if (!fs.existsSync(BOOKS_DIR)) fs.mkdirSync(BOOKS_DIR, { recursive: true });
    cb(null, BOOKS_DIR);
  },
  filename: (_req, file, cb) => {
    const safeName = path.basename(file.originalname)
      .replace(/[^a-zA-Z0-9א-ת._\- ]/g, '_')
      .slice(0, 120);
    cb(null, safeName);
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (SUPPORTED_EXTS.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error('רק קבצי PDF, Word (.docx) ו-PowerPoint (.pptx) מותרים'));
  },
  limits: { fileSize: 50 * 1024 * 1024 },
});

// GET /api/books
router.get('/', (_req, res) => {
  try {
    res.json({ success: true, data: listBooks() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/books/upload
router.post('/upload', upload.single('pdf'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'לא התקבל קובץ' });
  res.json({ success: true, data: { name: req.file.filename, size: req.file.size } });
});

// GET /api/books/stream/:name  — serve file for inline viewer
router.get('/stream/:name', (req, res) => {
  try {
    const safeName = path.basename(req.params.name);
    if (!SUPPORTED_EXTS.includes(path.extname(safeName).toLowerCase())) {
      return res.status(400).json({ success: false, message: 'סוג קובץ לא נתמך' });
    }
    const filePath = path.join(BOOKS_DIR, safeName);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'הקובץ לא נמצא' });
    }
    const ext = path.extname(safeName).toLowerCase();
    const mimeTypes = { '.pdf': 'application/pdf', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation' };
    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(safeName)}"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/books/:name
router.delete('/:name', (req, res) => {
  try {
    deleteBook(req.params.name);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;
