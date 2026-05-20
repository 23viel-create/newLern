const path = require('path');

// In a packaged Electron app, APP_DATA_DIR is set by electron/main.js to a
// writable location (app.getPath('userData')/data). In dev mode it falls back
// to the repo's own data/ directory relative to this file.
const DATA_BASE = process.env.APP_DATA_DIR
  ? path.resolve(process.env.APP_DATA_DIR)
  : path.join(__dirname, '../../data');

module.exports = {
  // מגבלות קבצים
  MAX_SUMMARY_SIZE_MB: 10,
  ALLOWED_FILE_TYPES: ['.txt', '.doc', '.docx', '.pdf'],

  // מגבלות ה-AI
  MAX_QUIZ_QUESTIONS: 20,
  MAX_OPEN_QUESTIONS: 10,
  MAX_PROMPT_CHARS: 8000,
  MAX_CONTEXT_CHARS: 3000,

  // ספריית הנתונים — absolute paths resolved at startup
  DATA_DIR:      DATA_BASE,
  SUMMARIES_DIR: path.join(DATA_BASE, 'summaries_tree'),
  SCHEDULE_FILE: path.join(DATA_BASE, 'schedule.json'),
  AI_KEYS_FILE:  path.join(DATA_BASE, 'ai_keys.json'),
  ARTICLES_DIR:  path.join(DATA_BASE, 'articles'),
};
