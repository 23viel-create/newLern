const { getApiKeys } = require('../config/gemini');

// placeholder — יוחלף בלוגיקה מלאה של Gemini בשלב הבא
async function generateQuiz(summaryText, type = 'multiple-choice') {
  const keys = getApiKeys();
  if (keys.length === 0) throw new Error('אין מפתחות API מוגדרים');
  // TODO: rotate keys & call Gemini API
}

async function generateOpenQuestions(summaryText) {
  const keys = getApiKeys();
  if (keys.length === 0) throw new Error('אין מפתחות API מוגדרים');
  // TODO: rotate keys & call Gemini API
}

function getKeyStatus() {
  const keys = getApiKeys();
  return { total: keys.length, active: keys.length };
}

module.exports = { generateQuiz, generateOpenQuestions, getKeyStatus };
