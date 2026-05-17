const express = require('express');
const router  = express.Router();
const {
  getFullTree,
  createFolder,
  createSummary,
  renameNode,
  deleteNode,
  getSummaryContent,
  setSummaryContent,
} = require('../controllers/filesController');

// GET /api/summaries/tree — עץ מלא (רקורסיבי)
router.get('/tree', (req, res) => {
  try {
    res.json({ success: true, data: getFullTree() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/summaries/folder — יצירת תיקייה
router.post('/folder', (req, res) => {
  try {
    const { parentPath = '', name } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'נדרש שם לתיקייה' });
    res.status(201).json({ success: true, data: createFolder(parentPath, name) });
  } catch (err) {
    const status = err.message.includes('כבר קיי') ? 409 : 400;
    res.status(status).json({ success: false, message: err.message });
  }
});

// POST /api/summaries/summary — יצירת סיכום
router.post('/summary', (req, res) => {
  try {
    const { parentPath = '', name } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'נדרש שם לסיכום' });
    res.status(201).json({ success: true, data: createSummary(parentPath, name) });
  } catch (err) {
    const status = err.message.includes('כבר קיי') ? 409 : 400;
    res.status(status).json({ success: false, message: err.message });
  }
});

// PATCH /api/summaries/rename — שינוי שם
router.patch('/rename', (req, res) => {
  try {
    const { nodePath, newName } = req.body;
    if (!nodePath || !newName) {
      return res.status(400).json({ success: false, message: 'נדרשים nodePath ו-newName' });
    }
    res.json({ success: true, data: renameNode(nodePath, newName) });
  } catch (err) {
    const status = err.message.includes('לא נמצא') ? 404 : 400;
    res.status(status).json({ success: false, message: err.message });
  }
});

// DELETE /api/summaries/node — מחיקת פריט (תיקייה או סיכום)
router.delete('/node', (req, res) => {
  try {
    const { nodePath } = req.body;
    if (!nodePath) return res.status(400).json({ success: false, message: 'נדרש nodePath' });
    deleteNode(nodePath);
    res.json({ success: true, message: 'הפריט נמחק בהצלחה' });
  } catch (err) {
    const status = err.message.includes('לא נמצא') ? 404 : 400;
    res.status(status).json({ success: false, message: err.message });
  }
});

// GET /api/summaries/content?path=… — קריאת תוכן סיכום
router.get('/content', (req, res) => {
  try {
    const nodePath = req.query.path;
    if (!nodePath) return res.status(400).json({ success: false, message: 'נדרש path' });
    res.json({ success: true, data: getSummaryContent(nodePath) });
  } catch (err) {
    res.status(404).json({ success: false, message: err.message });
  }
});

// PUT /api/summaries/content — שמירת תוכן סיכום
router.put('/content', (req, res) => {
  try {
    const { nodePath, text } = req.body;
    if (!nodePath) return res.status(400).json({ success: false, message: 'נדרש nodePath' });
    setSummaryContent(nodePath, text);
    res.json({ success: true, message: 'התוכן נשמר' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;
