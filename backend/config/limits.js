const fs   = require('fs');
const path = require('path');

// In a packaged Electron app, APP_DATA_DIR is set by electron/main.js to a
// writable location (app.getPath('userData')/data). In dev mode it falls back
// to the repo's own data/ directory relative to this file.
const DATA_BASE = process.env.APP_DATA_DIR
  ? path.resolve(process.env.APP_DATA_DIR)
  : path.join(__dirname, '../../data');

// ── Shared utility: ensure a JSON file is a real file, not a directory ────────
// Call before any read/write on a JSON data file. Guards against:
//   1. Parent directory not existing yet (first run / new data dir)
//   2. Path existing as a directory due to a prior packaging bug
//   3. File simply not existing yet (seeds default value)
function ensureJsonFile(filePath, defaultValue) {
  const dir = path.dirname(filePath);

  // Auto-correct: if the path exists as a directory, wipe it
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    fs.rmSync(filePath, { recursive: true, force: true });
  }

  fs.mkdirSync(dir, { recursive: true });

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2));
  }
}

module.exports = {
  // ── AI limits ───────────────────────────────────────────────────────────────
  MAX_SUMMARY_SIZE_MB: 10,
  ALLOWED_FILE_TYPES: ['.txt', '.doc', '.docx', '.pdf'],
  MAX_QUIZ_QUESTIONS: 20,
  MAX_OPEN_QUESTIONS: 10,
  MAX_PROMPT_CHARS: 8000,
  MAX_CONTEXT_CHARS: 3000,

  // ── Data paths — all derived from DATA_BASE so they always point to the ─────
  // ── correct writable location in both dev and packaged Electron builds ───────
  DATA_DIR:          DATA_BASE,
  SUMMARIES_DIR:     path.join(DATA_BASE, 'summaries_tree'),
  NOTES_DIR:         path.join(DATA_BASE, 'notes'),
  BOOKS_DIR:         path.join(DATA_BASE, 'books'),
  CHAT_CONTEXT_DIR:  path.join(DATA_BASE, 'chat_context'),
  BACKUPS_DIR:       path.join(DATA_BASE, 'backups'),
  WORD_CACHE_DIR:    path.join(DATA_BASE, 'word_cache'),
  ARTICLES_DIR:      path.join(DATA_BASE, 'articles'),

  SCHEDULE_FILE:     path.join(DATA_BASE, 'schedule.json'),
  AI_KEYS_FILE:      path.join(DATA_BASE, 'ai_keys.json'),
  STUDY_PATHS_FILE:  path.join(DATA_BASE, 'study_paths.json'),
  QUIZ_HISTORY_FILE: path.join(DATA_BASE, 'quiz_history.json'),

  // ── Utility ─────────────────────────────────────────────────────────────────
  ensureJsonFile,
};
