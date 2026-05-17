const express = require('express');
const router = express.Router();
const { getTodayTasks, completeTask, readSchedule } = require('../controllers/srController');

// GET /api/schedule — לוח זמנים מלא
router.get('/', (req, res) => {
  try {
    const schedule = readSchedule();
    res.json({ success: true, data: schedule });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/schedule/today — משימות להיום
router.get('/today', (req, res) => {
  try {
    const tasks = getTodayTasks();
    res.json({ success: true, data: tasks });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/schedule/:id/complete — סיום משימה
router.patch('/:id/complete', (req, res) => {
  try {
    const task = completeTask(req.params.id, req.body.quality ?? 3);
    res.json({ success: true, data: task });
  } catch (err) {
    res.status(404).json({ success: false, message: err.message });
  }
});

module.exports = router;
