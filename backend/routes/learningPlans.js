'use strict';
const express = require('express');
const router  = express.Router();
const { generateLearningPlan, optimizePlan } = require('../controllers/learningPlansController');

// POST /api/learning-plans/generate
router.post('/generate', async (req, res) => {
  await generateLearningPlan(req, res);
});

// POST /api/learning-plans/optimize — AI load-balancing consultation
router.post('/optimize', async (req, res) => {
  await optimizePlan(req, res);
});

module.exports = router;
