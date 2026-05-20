const express = require('express');
const router  = express.Router();
const { resetNotes, resetSchedule, resetSummaries, resetAll } = require('../controllers/dataController');

router.delete('/reset-notes',     resetNotes);
router.delete('/reset-schedule',  resetSchedule);
router.delete('/reset-summaries', resetSummaries);
router.delete('/reset-all',       resetAll);

module.exports = router;
