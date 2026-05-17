const express = require('express');
const router  = express.Router();
const {
  getQuestions, addQuestion, updateQuestion, deleteQuestion,
  getBundle, submitResult,
} = require('../controllers/quizController');

// ── Manual question CRUD ──────────────────────────────────────────────────────

router.get('/questions', (req, res) => {
  try {
    if (!req.query.path) return res.status(400).json({ success: false, message: 'path נדרש' });
    res.json({ success: true, data: getQuestions(req.query.path) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/questions/open', (req, res) => {
  try {
    const { nodePath, question, answer } = req.body;
    if (!nodePath || !question) return res.status(400).json({ success: false, message: 'nodePath ו-question נדרשים' });
    res.json({ success: true, data: addQuestion(nodePath, 'open', { question, answer: answer || '' }) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/questions/open/:id', (req, res) => {
  try {
    const { nodePath, question, answer } = req.body;
    if (!nodePath) return res.status(400).json({ success: false, message: 'nodePath נדרש' });
    res.json({ success: true, data: updateQuestion(nodePath, 'open', req.params.id, { question, answer }) });
  } catch (err) {
    res.status(err.message === 'שאלה לא נמצאה' ? 404 : 500).json({ success: false, message: err.message });
  }
});

router.delete('/questions/open', (req, res) => {
  try {
    const { nodePath, id } = req.body;
    if (!nodePath || !id) return res.status(400).json({ success: false, message: 'חסרים שדות' });
    deleteQuestion(nodePath, 'open', id);
    res.json({ success: true });
  } catch (err) {
    res.status(err.message === 'שאלה לא נמצאה' ? 404 : 500).json({ success: false, message: err.message });
  }
});

router.post('/questions/mc', (req, res) => {
  try {
    const { nodePath, question, options, correct_option_index } = req.body;
    if (!nodePath || !question || !Array.isArray(options) || options.length < 2) {
      return res.status(400).json({ success: false, message: 'שדות חסרים (נדרשות לפחות 2 אפשרויות)' });
    }
    res.json({ success: true, data: addQuestion(nodePath, 'mc', { question, options, correct_option_index: correct_option_index ?? 0 }) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/questions/mc/:id', (req, res) => {
  try {
    const { nodePath, question, options, correct_option_index } = req.body;
    if (!nodePath) return res.status(400).json({ success: false, message: 'nodePath נדרש' });
    res.json({ success: true, data: updateQuestion(nodePath, 'mc', req.params.id, { question, options, correct_option_index }) });
  } catch (err) {
    res.status(err.message === 'שאלה לא נמצאה' ? 404 : 500).json({ success: false, message: err.message });
  }
});

router.delete('/questions/mc', (req, res) => {
  try {
    const { nodePath, id } = req.body;
    if (!nodePath || !id) return res.status(400).json({ success: false, message: 'חסרים שדות' });
    deleteQuestion(nodePath, 'mc', id);
    res.json({ success: true });
  } catch (err) {
    res.status(err.message === 'שאלה לא נמצאה' ? 404 : 500).json({ success: false, message: err.message });
  }
});

// ── Bundle & Submit ───────────────────────────────────────────────────────────

router.post('/bundle', (req, res) => {
  try {
    const { paths } = req.body;
    if (!Array.isArray(paths) || !paths.length) return res.status(400).json({ success: false, message: 'paths נדרש' });
    res.json({ success: true, data: getBundle(paths) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/submit', (req, res) => {
  try {
    const { summaryPath, totalScore, questionResults } = req.body;
    submitResult(summaryPath || null, totalScore ?? 0, questionResults || []);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── AI generation (legacy — requires aiController) ────────────────────────────

router.post('/multiple-choice', async (req, res) => {
  try {
    const { generateQuiz } = require('../controllers/aiController');
    const { summaryText }  = req.body;
    if (!summaryText) return res.status(400).json({ success: false, message: 'נדרש טקסט' });
    res.json({ success: true, data: await generateQuiz(summaryText, 'multiple-choice') });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/open-questions', async (req, res) => {
  try {
    const { generateOpenQuestions } = require('../controllers/aiController');
    const { summaryText } = req.body;
    if (!summaryText) return res.status(400).json({ success: false, message: 'נדרש טקסט' });
    res.json({ success: true, data: await generateOpenQuestions(summaryText) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
