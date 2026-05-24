const express = require('express');
const router  = express.Router();
const {
  getQuestions, addQuestion, updateQuestion, deleteQuestion,
  getBundle, submitResult, getHistory, saveHistory, deleteHistory,
  getSummaryForBulkGenerate,
} = require('../controllers/quizController');
const aiCtrl = require('../controllers/aiController');

// ── Manual question CRUD ──────────────────────────────────────────────────────

router.get('/questions', (req, res) => {
  try {
    if (!req.query.path) return res.status(400).json({ success: false, message: 'path נדרש' });
    res.json({ success: true, data: getQuestions(req.query.path) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/questions/open', (req, res) => {
  try {
    const { nodePath, question, answer, difficulty } = req.body;
    if (!nodePath || !question) return res.status(400).json({ success: false, message: 'nodePath ו-question נדרשים' });
    const data = { question, answer: answer || '' };
    if (difficulty) data.difficulty = difficulty;
    res.json({ success: true, data: addQuestion(nodePath, 'open', data) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/questions/open/:id', (req, res) => {
  try {
    const { nodePath, question, answer, difficulty } = req.body;
    if (!nodePath) return res.status(400).json({ success: false, message: 'nodePath נדרש' });
    const data = { question, answer };
    if (difficulty) data.difficulty = difficulty;
    res.json({ success: true, data: updateQuestion(nodePath, 'open', req.params.id, data) });
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
    const { nodePath, question, options, correct_option_index, difficulty } = req.body;
    if (!nodePath || !question || !Array.isArray(options) || options.length < 2) {
      return res.status(400).json({ success: false, message: 'שדות חסרים (נדרשות לפחות 2 אפשרויות)' });
    }
    const data = { question, options, correct_option_index: correct_option_index ?? 0 };
    if (difficulty) data.difficulty = difficulty;
    res.json({ success: true, data: addQuestion(nodePath, 'mc', data) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/questions/mc/:id', (req, res) => {
  try {
    const { nodePath, question, options, correct_option_index, difficulty } = req.body;
    if (!nodePath) return res.status(400).json({ success: false, message: 'nodePath נדרש' });
    const data = { question, options, correct_option_index };
    if (difficulty) data.difficulty = difficulty;
    res.json({ success: true, data: updateQuestion(nodePath, 'mc', req.params.id, data) });
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

// ── Quiz History ──────────────────────────────────────────────────────────────

router.get('/history', (_req, res) => {
  try { res.json({ success: true, data: getHistory() }); }
  catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/history', (req, res) => {
  try {
    const entry = req.body;
    if (!entry || !entry.timestamp) return res.status(400).json({ success: false, message: 'timestamp נדרש' });
    saveHistory(entry);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.delete('/history', (req, res) => {
  try {
    const { timestamp } = req.body;
    if (!timestamp) return res.status(400).json({ success: false, message: 'timestamp נדרש' });
    deleteHistory(timestamp);
    res.json({ success: true });
  } catch (err) { res.status(err.status || 500).json({ success: false, message: err.message }); }
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

// ── AI Bulk Generation ────────────────────────────────────────────────────────

router.post('/bulk-generate', async (req, res) => {
  try {
    const { nodePath, quantity, difficulty, type } = req.body;
    if (!nodePath) return res.status(400).json({ success: false, message: 'nodePath נדרש' });
    const { content, title } = getSummaryForBulkGenerate(nodePath);
    if (!content) return res.status(400).json({ success: false, message: 'הסיכום ריק — אין תוכן ליצירת שאלות' });
    const questions = await aiCtrl.bulkGenerateQuestions({
      summaryContent: content,
      summaryTitle:   title,
      quantity:       Math.min(50, Math.max(1, Number(quantity) || 20)),
      difficulty:     difficulty || 'mixed_random',
      type:           type       || 'both',
    });
    res.json({ success: true, data: questions });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/bulk-save', (req, res) => {
  try {
    const { nodePath, questions } = req.body;
    if (!nodePath || !Array.isArray(questions)) {
      return res.status(400).json({ success: false, message: 'nodePath ו-questions נדרשים' });
    }
    let count = 0;
    for (const q of questions) {
      if (!q || !q.question) continue;
      if (q.qtype === 'open') {
        addQuestion(nodePath, 'open', {
          question:   q.question,
          answer:     q.answer || '',
          difficulty: q.difficulty || null,
        });
        count++;
      } else if (q.qtype === 'mc' && Array.isArray(q.options) && q.options.length >= 2) {
        addQuestion(nodePath, 'mc', {
          question:             q.question,
          options:              q.options,
          correct_option_index: q.correct_option_index ?? 0,
          difficulty:           q.difficulty || null,
        });
        count++;
      }
    }
    res.json({ success: true, data: { count } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
