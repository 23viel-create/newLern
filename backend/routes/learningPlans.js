'use strict';
const express = require('express');
const router  = express.Router();
const {
  generateLearningPlan,
  optimizePlan,
  getStudyPaths,
  deleteStudyPath,
  editStudyPath,
} = require('../controllers/learningPlansController');

// POST /api/learning-plans/generate
router.post('/generate', async (req, res) => {
  await generateLearningPlan(req, res);
});

// POST /api/learning-plans/optimize
router.post('/optimize', async (req, res) => {
  await optimizePlan(req, res);
});

// GET /api/learning-plans/paths
router.get('/paths', async (req, res) => {
  await getStudyPaths(req, res);
});

// DELETE /api/learning-plans/paths/:id
router.delete('/paths/:id', async (req, res) => {
  await deleteStudyPath(req, res);
});

// POST /api/learning-plans/paths/:id/edit
router.post('/paths/:id/edit', async (req, res) => {
  await editStudyPath(req, res);
});

module.exports = router;
