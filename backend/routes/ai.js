const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/aiController');

// GET  /api/ai/keys        — list masked keys + battery status
router.get('/keys', (_req, res) => {
  try {
    res.json({ status: ctrl.getKeyStatus(), keys: ctrl.getKeys().map((k, i) => ({ index: i + 1, masked: k.length > 10 ? k.slice(0, 6) + '…' + k.slice(-4) : '(קצר)' })) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT  /api/ai/keys        — save keys array
router.put('/keys', (req, res) => {
  try {
    const { keys } = req.body;
    if (!Array.isArray(keys)) return res.status(400).json({ error: 'keys חייב להיות מערך' });
    ctrl.updateKeys(keys);
    res.json({ ok: true, count: keys.filter(k => k && k.trim()).length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET  /api/ai/key-status  — battery display
router.get('/key-status', (_req, res) => {
  try {
    res.json(ctrl.getKeyStatus());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/ask         — contextual chat
router.post('/ask', async (req, res) => {
  try {
    const { context, userMessage, extra, selectedBooks } = req.body;
    if (!userMessage) return res.status(400).json({ error: 'userMessage נדרש' });
    const answer = await ctrl.askContextual({ context: context || 'general', userMessage, extra, selectedBooks });
    res.json({ answer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/suggest-questions
router.post('/suggest-questions', async (req, res) => {
  try {
    const { summaryContent, summaryTitle, existingQuestions, type } = req.body;
    const result = await ctrl.suggestQuestions({ summaryContent, summaryTitle, existingQuestions, type });
    res.json({ questions: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/schedule-advice
router.post('/schedule-advice', async (req, res) => {
  try {
    const { heavyDays, totalTasks } = req.body;
    const advice = await ctrl.getScheduleAdvice({ heavyDays, totalTasks });
    res.json({ advice });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/articles-chat
router.post('/articles-chat', async (req, res) => {
  try {
    const { userMessage } = req.body;
    if (!userMessage) return res.status(400).json({ error: 'userMessage נדרש' });
    const answer = await ctrl.chatWithArticles(userMessage);
    res.json({ answer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/learning-program
router.post('/learning-program', async (req, res) => {
  try {
    const { goals, daysPerWeek, hoursPerDay } = req.body;
    const program = await ctrl.generateLearningProgram({ goals, daysPerWeek, hoursPerDay });
    res.json({ program });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/parse-sr-program  { hebrewText }
router.post('/parse-sr-program', async (req, res) => {
  try {
    const { hebrewText } = req.body;
    if (!hebrewText) return res.status(400).json({ error: 'hebrewText נדרש' });
    const sequence = await ctrl.parseSrProgramFromText(hebrewText);
    res.json({ sequence });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/suggest-single-question  { summaryPath, summaryTitle, type }
router.post('/suggest-single-question', async (req, res) => {
  try {
    const { summaryPath, summaryTitle, type } = req.body;
    if (!summaryPath) return res.status(400).json({ error: 'summaryPath נדרש' });
    const result = await ctrl.suggestSingleQuestion({ summaryPath, summaryTitle, type: type || 'open' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/grade-answer  { question, sampleAnswer, userAnswer, strictness }
router.post('/grade-answer', async (req, res) => {
  try {
    const { question, sampleAnswer, userAnswer, strictness } = req.body;
    const result = await ctrl.gradeAnswer({ question, sampleAnswer, userAnswer, strictness });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
