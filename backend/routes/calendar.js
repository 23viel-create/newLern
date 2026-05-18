'use strict';
const express = require('express');
const router  = express.Router();
const { extendParashot } = require('../controllers/calendarController');

// POST /api/calendar/extend-parashot — AI extends parasha dictionary
router.post('/extend-parashot', async (req, res) => {
  await extendParashot(req, res);
});

module.exports = router;
