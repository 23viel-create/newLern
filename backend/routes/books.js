'use strict';
const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { listBooks, listFolders, createBookFolder, deleteBook, saveBookMeta, BOOKS_DIR, SUPPORTED_EXTS } = require('../controllers/booksController');

const router = express.Router();

// Multer passes originalname as latin1-decoded bytes; re-encode to get the true UTF-8 string.
function _fixName(raw) {
  return Buffer.from(raw, 'latin1').toString('utf8');
}

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const folder = (req.body?.folder || '').replace(/\.\./g, '').replace(/\\/g, '/');
    const destDir = folder ? path.join(BOOKS_DIR, folder) : BOOKS_DIR;
    fs.mkdirSync(destDir, { recursive: true });
    cb(null, destDir);
  },
  filename: (_req, file, cb) => {
    const safeName = path.basename(_fixName(file.originalname))
      .replace(/[^a-zA-Z0-9א-ת._\- ]/g, '_')
      .slice(0, 120);
    cb(null, safeName);
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (SUPPORTED_EXTS.includes(path.extname(_fixName(file.originalname)).toLowerCase())) cb(null, true);
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

// GET /api/books/folders
router.get('/folders', (_req, res) => {
  try {
    res.json({ success: true, data: listFolders() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/books/folder  { name, parent? }
router.post('/folder', (req, res) => {
  try {
    const parent = (req.body?.parent || '').replace(/\.\./g, '').trim();
    const name   = (req.body?.name  || '').replace(/[/\\]/g, '').trim();
    if (!name) return res.status(400).json({ success: false, message: 'שם תיקייה חסר' });
    const relPath = parent ? `${parent}/${name}` : name;
    const created = createBookFolder(relPath);
    res.json({ success: true, data: { path: created } });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/books/upload
router.post('/upload', upload.single('pdf'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'לא התקבל קובץ' });
  const cleanName = _fixName(req.file.originalname);
  // req.file.path is the full absolute path on disk
  saveBookMeta(req.file.path, cleanName);
  const folder = (req.body?.folder || '').replace(/\.\./g, '').replace(/\\/g, '/');
  res.json({ success: true, data: { name: req.file.filename, folder, displayName: cleanName, size: req.file.size } });
});

// GET /api/books/stream/*  — serve file for inline viewer (supports subfolders)
router.get(/^\/stream\/(.+)$/, (req, res) => {
  try {
    const relName  = req.params[0] || '';
    const safeName = relName.split('/').map(s => path.basename(s)).join('/');
    if (!SUPPORTED_EXTS.includes(path.extname(safeName).toLowerCase())) {
      return res.status(400).json({ success: false, message: 'סוג קובץ לא נתמך' });
    }
    const filePath = path.join(BOOKS_DIR, safeName);
    if (!filePath.startsWith(BOOKS_DIR) || !fs.existsSync(filePath)) {
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

// DELETE /api/books/*  (supports folder/file.pdf)
router.delete(/^\/(.+)$/, (req, res) => {
  try {
    const relName = req.params[0] || req.params.name || '';
    deleteBook(relName);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;
