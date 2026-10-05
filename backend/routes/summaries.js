const express = require('express');
const multer  = require('multer');
const router  = express.Router();

const {
  getFullTree,
  createFolder,
  createSummary,
  renameNode,
  deleteNode,
  getSummaryContent,
  setSummaryContent,
  getSummaryHistory,
  restoreHistoryVersion,
  listAudioFiles,
  saveAudioBuffer,
  deleteAudioFile,
  getAudioFilePath,
  bulkImport,
  getNeighbors,
  importFileToFolder,
} = require('../controllers/filesController');

// multer with memory storage — buffer written to disk in controller
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
});

// ─── tree ─────────────────────────────────────────────────────────────────────

router.get('/tree', (_req, res) => {
  try { res.json({ success: true, data: getFullTree() }); }
  catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/neighbors', (req, res) => {
  try {
    const { path: nodePath } = req.query;
    if (!nodePath) return res.status(400).json({ success: false, message: 'נדרש path' });
    res.json({ success: true, data: getNeighbors(nodePath) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ─── folder / summary CRUD ───────────────────────────────────────────────────

router.post('/folder', (req, res) => {
  try {
    const { parentPath = '', name } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'נדרש שם לתיקייה' });
    res.status(201).json({ success: true, data: createFolder(parentPath, name) });
  } catch (err) {
    res.status(err.message.includes('כבר קיי') ? 409 : 400)
       .json({ success: false, message: err.message });
  }
});

router.post('/summary', (req, res) => {
  try {
    const { parentPath = '', name } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'נדרש שם לסיכום' });
    res.status(201).json({ success: true, data: createSummary(parentPath, name) });
  } catch (err) {
    res.status(err.message.includes('כבר קיי') ? 409 : 400)
       .json({ success: false, message: err.message });
  }
});

router.patch('/rename', (req, res) => {
  try {
    const { nodePath, newName } = req.body;
    if (!nodePath || !newName)
      return res.status(400).json({ success: false, message: 'נדרשים nodePath ו-newName' });
    res.json({ success: true, data: renameNode(nodePath, newName) });
  } catch (err) {
    res.status(err.message.includes('לא נמצא') ? 404 : 400)
       .json({ success: false, message: err.message });
  }
});

router.delete('/node', (req, res) => {
  try {
    const { nodePath } = req.body;
    if (!nodePath) return res.status(400).json({ success: false, message: 'נדרש nodePath' });
    deleteNode(nodePath);
    res.json({ success: true, message: 'הפריט נמחק בהצלחה' });
  } catch (err) {
    res.status(err.message.includes('לא נמצא') ? 404 : 400)
       .json({ success: false, message: err.message });
  }
});

// ─── content ──────────────────────────────────────────────────────────────────

router.get('/content', (req, res) => {
  try {
    const { path: nodePath } = req.query;
    if (!nodePath) return res.status(400).json({ success: false, message: 'נדרש path' });
    res.json({ success: true, data: getSummaryContent(nodePath) });
  } catch (err) { res.status(404).json({ success: false, message: err.message }); }
});

router.put('/content', (req, res) => {
  try {
    const { nodePath, text } = req.body;
    if (!nodePath) return res.status(400).json({ success: false, message: 'נדרש nodePath' });
    setSummaryContent(nodePath, text);
    res.json({ success: true, message: 'התוכן נשמר' });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

// GET history list
router.get('/history', (req, res) => {
  try {
    const { path: nodePath } = req.query;
    if (!nodePath) return res.status(400).json({ success: false, message: 'נדרש path' });
    res.json({ success: true, data: getSummaryHistory(nodePath) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST restore history version
router.post('/history/restore', (req, res) => {
  try {
    const { nodePath, versionIndex } = req.body;
    if (!nodePath) return res.status(400).json({ success: false, message: 'נדרש nodePath' });
    const content = restoreHistoryVersion(nodePath, versionIndex ?? 0);
    res.json({ success: true, data: content });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

// ─── audio ───────────────────────────────────────────────────────────────────

// GET list of audio files for a summary
router.get('/audio', (req, res) => {
  try {
    const { path: nodePath } = req.query;
    if (!nodePath) return res.status(400).json({ success: false, message: 'נדרש path' });
    res.json({ success: true, data: listAudioFiles(nodePath) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST upload or record audio (multipart: field "audio" + field "nodePath")
router.post('/audio/upload', upload.single('audio'), (req, res) => {
  try {
    const { nodePath } = req.body;
    if (!nodePath) return res.status(400).json({ success: false, message: 'נדרש nodePath' });
    if (!req.file)  return res.status(400).json({ success: false, message: 'נדרש קובץ שמע' });
    const savedName = saveAudioBuffer(nodePath, req.file.originalname, req.file.buffer);
    res.status(201).json({ success: true, data: { filename: savedName } });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

// DELETE audio file
router.delete('/audio', (req, res) => {
  try {
    const { nodePath, filename } = req.body;
    if (!nodePath || !filename)
      return res.status(400).json({ success: false, message: 'נדרשים nodePath ו-filename' });
    deleteAudioFile(nodePath, filename);
    res.json({ success: true, message: 'קובץ השמע נמחק' });
  } catch (err) {
    res.status(err.message.includes('לא נמצא') ? 404 : 400)
       .json({ success: false, message: err.message });
  }
});

// GET stream audio file
router.get('/audio/file', (req, res) => {
  try {
    const { path: nodePath, file } = req.query;
    if (!nodePath || !file)
      return res.status(400).json({ success: false, message: 'נדרשים path ו-file' });
    const filePath = getAudioFilePath(nodePath, file);
    res.sendFile(filePath);
  } catch (err) {
    res.status(404).json({ success: false, message: err.message });
  }
});

// ─── bulk import ─────────────────────────────────────────────────────────────

// Accepts either JSON body or multipart (with optional text file)
router.post('/bulk-import', upload.single('file'), (req, res) => {
  try {
    let { parentPath = '', content, delimiter, baseName } = req.body;
    // If a text file was uploaded, use its content
    if (req.file) {
      content = req.file.buffer.toString('utf-8');
    }
    if (!content) return res.status(400).json({ success: false, message: 'נדרש תוכן לייבוא' });
    if (!delimiter) return res.status(400).json({ success: false, message: 'נדרש מפריד' });
    const created = bulkImport(parentPath, content, delimiter, baseName);
    res.status(201).json({ success: true, data: created });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/summaries/import-file  (multipart: field "file" + field "folderPath")
router.post('/import-file', upload.single('file'), (req, res) => {
  try {
    const { folderPath = '' } = req.body;
    if (!req.file) return res.status(400).json({ success: false, message: 'נדרש קובץ' });
    const result = importFileToFolder(
      folderPath, req.file.originalname, req.file.buffer, req.file.mimetype,
    );
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;
