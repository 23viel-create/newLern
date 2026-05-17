const express = require('express');
const router = express.Router();
const { generateQuiz, generateOpenQuestions } = require('../controllers/aiController');

// POST /api/quizzes/multiple-choice
router.post('/multiple-choice', async (req, res) => {
  try {
    const { summaryText } = req.body;
    if (!summaryText) return res.status(400).json({ success: false, message: 'נדרש טקסט לסיכום' });
    const questions = await generateQuiz(summaryText, 'multiple-choice');
    res.json({ success: true, data: questions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/quizzes/open-questions
router.post('/open-questions', async (req, res) => {
  try {
    const { summaryText } = req.body;
    if (!summaryText) return res.status(400).json({ success: false, message: 'נדרש טקסט לסיכום' });
    const questions = await generateOpenQuestions(summaryText);
    res.json({ success: true, data: questions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
