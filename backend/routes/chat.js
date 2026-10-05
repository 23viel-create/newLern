const express = require('express');
const multer  = require('multer');
const router  = express.Router();
const { listFiles, saveFile, deleteFile, getFilePath } = require('../controllers/chatContextController');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// GET /api/chat/files
router.get('/files', (_req, res) => {
  try { res.json({ success: true, data: listFiles() }); }
  catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/chat/files  — multipart, field "file"
router.post('/files', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'לא נבחר קובץ' });
    const name = saveFile(req.file.originalname, req.file.buffer);
    res.json({ success: true, data: { name } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/chat/files/:name
router.delete('/files/:name', (req, res) => {
  try {
    deleteFile(req.params.name);
    res.json({ success: true });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
});

// GET /api/chat/files/:name  — serve / preview
router.get('/files/:name', (req, res) => {
  try {
    const filePath = getFilePath(req.params.name);
    res.sendFile(filePath);
  } catch (err) {
    res.status(err.status || 404).json({ success: false, message: err.message });
  }
});

module.exports = router;
