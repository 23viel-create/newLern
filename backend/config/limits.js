module.exports = {
  // מגבלות קבצים
  MAX_SUMMARY_SIZE_MB: 10,
  ALLOWED_FILE_TYPES: ['.txt', '.doc', '.docx', '.pdf'],

  // מגבלות ה-AI
  MAX_QUIZ_QUESTIONS: 20,
  MAX_OPEN_QUESTIONS: 10,

  // ספריית הנתונים
  DATA_DIR: '../data',
  SUMMARIES_DIR: '../data/summaries_tree',
  SCHEDULE_FILE: '../data/schedule.json',
};
