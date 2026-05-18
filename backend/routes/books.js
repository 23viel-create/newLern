'use strict';
const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { listBooks, deleteBook, BOOKS_DIR } = require('../controllers/booksController');

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
    if (path.extname(file.originalname).toLowerCase() === '.pdf') cb(null, true);
    else cb(new Error('רק קבצי PDF מותרים'));
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
  if (!req.file) return res.status(400).json({ success: false, message: 'לא התקבל קובץ PDF' });
  res.json({ success: true, data: { name: req.file.filename, size: req.file.size } });
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
