const express = require('express');
const router  = express.Router();
const {
  getTodayTasks, completeTask,
  planSummary,
  getCalendarData,
  getSettings, saveSettings,
  getPrograms, createProgram, deleteProgram,
  readSchedule,
} = require('../controllers/srController');

// GET /api/schedule — full schedule
router.get('/', (req, res) => {
  try {
    res.json({ success: true, data: readSchedule() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/schedule/today — today's tasks
router.get('/today', (req, res) => {
  try {
    res.json({ success: true, data: getTodayTasks() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/schedule/calendar?month=YYYY-MM — calendar grid data
router.get('/calendar', (req, res) => {
  try {
    const month = req.query.month || new Date().toISOString().slice(0, 7);
    res.json({ success: true, data: getCalendarData(month) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/schedule/settings
router.get('/settings', (req, res) => {
  try {
    res.json({ success: true, data: getSettings() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/schedule/settings
router.put('/settings', (req, res) => {
  try {
    const updated = saveSettings(req.body);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/schedule/plan — schedule a summary for spaced repetition
router.post('/plan', (req, res) => {
  try {
    const { summaryPath, title, programId } = req.body;
    if (!summaryPath) throw new Error('summaryPath נדרש');
    const tasks = planSummary(summaryPath, title || summaryPath, programId);
    res.json({ success: true, data: tasks });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET /api/schedule/programs — list programs sorted by usage
router.get('/programs', (req, res) => {
  try {
    res.json({ success: true, data: getPrograms() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/schedule/programs — create a new program
router.post('/programs', (req, res) => {
  try {
    const { name, sequence } = req.body;
    const program = createProgram(name, sequence);
    res.status(201).json({ success: true, data: program });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// DELETE /api/schedule/programs/:id
router.delete('/programs/:id', (req, res) => {
  try {
    deleteProgram(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// PATCH /api/schedule/:id/complete — mark task done
router.patch('/:id/complete', (req, res) => {
  try {
    const task = completeTask(req.params.id);
    res.json({ success: true, data: task });
  } catch (err) {
    res.status(404).json({ success: false, message: err.message });
  }
});

module.exports = router;
