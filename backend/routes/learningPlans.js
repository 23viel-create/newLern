'use strict';
const express = require('express');
const router  = express.Router();
const { generateLearningPlan } = require('../controllers/learningPlansController');

// POST /api/learning-plans/generate
router.post('/generate', async (req, res) => {
  await generateLearningPlan(req, res);
});

module.exports = router;
