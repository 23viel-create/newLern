module.exports = {
  // מגבלות קבצים
  MAX_SUMMARY_SIZE_MB: 10,
  ALLOWED_FILE_TYPES: ['.txt', '.doc', '.docx', '.pdf'],

  // מגבלות ה-AI
  MAX_QUIZ_QUESTIONS: 20,
  MAX_OPEN_QUESTIONS: 10,
  MAX_PROMPT_CHARS: 8000,
  MAX_CONTEXT_CHARS: 3000,

  // ספריית הנתונים (נתיבים יחסיים מתוך backend/controllers/)
  DATA_DIR: '../../data',
  SUMMARIES_DIR: '../../data/summaries_tree',
  SCHEDULE_FILE: '../../data/schedule.json',
  AI_KEYS_FILE: '../../data/ai_keys.json',
  ARTICLES_DIR: '../../data/articles',
};
