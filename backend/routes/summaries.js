const express = require('express');
const router = express.Router();
const { listSummaries, createSummaryDir, deleteSummaryDir } = require('../controllers/filesController');

// GET /api/summaries — רשימת כל הסיכומים
router.get('/', (req, res) => {
  try {
    const summaries = listSummaries(req.query.parentId);
    res.json({ success: true, data: summaries });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/summaries — יצירת סיכום חדש
router.post('/', (req, res) => {
  try {
    const { summaryId } = req.body;
    if (!summaryId) return res.status(400).json({ success: false, message: 'נדרש מזהה לסיכום' });
    const summaryPath = createSummaryDir(summaryId);
    res.status(201).json({ success: true, data: { summaryId, path: summaryPath } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/summaries/:id — מחיקת סיכום (דורש אישור בצד לקוח)
router.delete('/:id', (req, res) => {
  try {
    deleteSummaryDir(req.params.id);
    res.json({ success: true, message: 'הסיכום נמחק בהצלחה' });
  } catch (err) {
    res.status(404).json({ success: false, message: err.message });
  }
});

module.exports = router;
