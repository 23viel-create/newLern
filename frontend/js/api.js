// שכבת תקשורת עם ה-API המקומי
const API_BASE = '/api';

async function apiFetch(endpoint, options = {}) {
  const res  = await fetch(`${API_BASE}${endpoint}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || 'שגיאה בתקשורת עם השרת');
  return data.data;
}

/** Multipart POST — body must be a FormData instance. */
async function apiFormFetch(endpoint, formData) {
  const res  = await fetch(`${API_BASE}${endpoint}`, { method: 'POST', body: formData });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || 'שגיאה בתקשורת עם השרת');
  return data.data;
}

async function apiFetchPlain(endpoint, options = {}) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `שגיאת שרת ${res.status}`);
  return data;
}

const Api = {
  // ── כללי ──────────────────────────────────────────────────────────────────
  health: () => apiFetch('/health'),

  // ── עץ סיכומים ──────────────────────────────────────────────────────────
  getTree:       ()                   => apiFetch('/summaries/tree'),
  getNeighbors:  (nodePath)           => apiFetch(`/summaries/neighbors?path=${encodeURIComponent(nodePath)}`),
  createFolder:  (parentPath, name)   => apiFetch('/summaries/folder',  { method: 'POST',   body: { parentPath, name } }),
  createSummary: (parentPath, name)   => apiFetch('/summaries/summary', { method: 'POST',   body: { parentPath, name } }),
  renameNode:    (nodePath, newName)  => apiFetch('/summaries/rename',  { method: 'PATCH',  body: { nodePath, newName } }),
  deleteNode:    (nodePath)           => apiFetch('/summaries/node',    { method: 'DELETE', body: { nodePath } }),

  // ── תוכן ────────────────────────────────────────────────────────────────
  getContent:  (nodePath)       => apiFetch(`/summaries/content?path=${encodeURIComponent(nodePath)}`),
  saveContent: (nodePath, text) => apiFetch('/summaries/content', { method: 'PUT', body: { nodePath, text } }),

  // ── שמע ─────────────────────────────────────────────────────────────────
  getAudioList: (nodePath) => apiFetch(`/summaries/audio?path=${encodeURIComponent(nodePath)}`),

  /** Upload or save recorded audio via multipart FormData */
  uploadAudio: (nodePath, blob, filename) => {
    const fd = new FormData();
    fd.append('nodePath', nodePath);
    fd.append('audio', blob, filename);
    return apiFormFetch('/summaries/audio/upload', fd);
  },

  deleteAudio: (nodePath, filename) =>
    apiFetch('/summaries/audio', { method: 'DELETE', body: { nodePath, filename } }),

  /** Build URL for streaming an audio file */
  audioFileUrl: (nodePath, filename) =>
    `${API_BASE}/summaries/audio/file?path=${encodeURIComponent(nodePath)}&file=${encodeURIComponent(filename)}`,

  // ── ייבוא בתפזורת ────────────────────────────────────────────────────────
  /** Text-based bulk import (JSON body) */
  bulkImportText: (parentPath, content, delimiter, baseName) =>
    apiFetch('/summaries/bulk-import', {
      method: 'POST',
      body: { parentPath, content, delimiter, baseName },
    }),

  /** File-based bulk import (multipart) */
  bulkImportFile: (parentPath, file, delimiter, baseName) => {
    const fd = new FormData();
    fd.append('parentPath', parentPath);
    fd.append('delimiter',  delimiter);
    fd.append('baseName',   baseName || '');
    fd.append('file', file);
    return apiFormFetch('/summaries/bulk-import', fd);
  },

  // ── לוח זמנים ────────────────────────────────────────────────────────────
  getSchedule:      ()              => apiFetch('/schedule'),
  getTodayTasks:    ()              => apiFetch('/schedule/today'),
  completeTask:     (id, quality)   => apiFetch(`/schedule/${id}/complete`, { method: 'PATCH', body: { quality } }),
  getCalendarData:  (month)         => apiFetch(`/schedule/calendar?month=${encodeURIComponent(month)}`),
  planSummary:      (summaryPath, title, programId) =>
    apiFetch('/schedule/plan', { method: 'POST', body: { summaryPath, title, programId } }),
  getScheduleSettings:  ()          => apiFetch('/schedule/settings'),
  saveScheduleSettings: (settings)  => apiFetch('/schedule/settings', { method: 'PUT', body: settings }),

  // ── תוכניות חזרה ─────────────────────────────────────────────────────────
  getPrograms:    ()                       => apiFetch('/schedule/programs'),
  createProgram:  (name, sequence)         => apiFetch('/schedule/programs', { method: 'POST', body: { name, sequence } }),
  deleteProgram:  (id)                     => apiFetch(`/schedule/programs/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // ── ייבוא קובץ לתיקייה ───────────────────────────────────────────────────
  importFileToFolder: (folderPath, file) => {
    const fd = new FormData();
    fd.append('folderPath', folderPath);
    fd.append('file', file);
    return apiFormFetch('/summaries/import-file', fd);
  },

  // ── שאלות (CRUD ידני) ─────────────────────────────────────────────────────
  getQuizQuestions: (nodePath) =>
    apiFetch(`/quizzes/questions?path=${encodeURIComponent(nodePath)}`),

  addOpenQuestion: (nodePath, question, answer) =>
    apiFetch('/quizzes/questions/open', { method: 'POST', body: { nodePath, question, answer } }),
  updateOpenQuestion: (nodePath, id, question, answer) =>
    apiFetch(`/quizzes/questions/open/${encodeURIComponent(id)}`, { method: 'PUT', body: { nodePath, question, answer } }),
  deleteOpenQuestion: (nodePath, id) =>
    apiFetch('/quizzes/questions/open', { method: 'DELETE', body: { nodePath, id } }),

  addMcQuestion: (nodePath, question, options, correct_option_index) =>
    apiFetch('/quizzes/questions/mc', { method: 'POST', body: { nodePath, question, options, correct_option_index } }),
  updateMcQuestion: (nodePath, id, question, options, correct_option_index) =>
    apiFetch(`/quizzes/questions/mc/${encodeURIComponent(id)}`, { method: 'PUT', body: { nodePath, question, options, correct_option_index } }),
  deleteMcQuestion: (nodePath, id) =>
    apiFetch('/quizzes/questions/mc', { method: 'DELETE', body: { nodePath, id } }),

  getQuizBundle:    (paths) =>
    apiFetch('/quizzes/bundle', { method: 'POST', body: { paths } }),
  submitQuizResult: (summaryPath, totalScore, questionResults) =>
    apiFetch('/quizzes/submit', { method: 'POST', body: { summaryPath, totalScore, questionResults } }),

  // ── גיבוי וייצוא ────────────────────────────────────────────────────────
  /** Returns a download URL for the ZIP — open in tab or anchor */
  backupZipUrl: (subPath, save) => {
    let url = `${API_BASE}/backup/zip`;
    const params = [];
    if (subPath) params.push(`subPath=${encodeURIComponent(subPath)}`);
    if (save)    params.push('save=1');
    if (params.length) url += '?' + params.join('&');
    return url;
  },
  backupList:   ()              => apiFetchPlain('/backup/list', {}),
  backupImport: (file, targetPath) => {
    const fd = new FormData();
    fd.append('zip', file);
    if (targetPath) fd.append('targetPath', targetPath);
    return fetch(`${API_BASE}/backup/import`, { method: 'POST', body: fd })
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); return d; });
  },

  // ── ייצוא Word ─────────────────────────────────────────────────────────
  docxExportUrl: (nodePath, title) =>
    `${API_BASE}/backup/docx`, // POST — handled via fetch+blob in backupManager

  openInWord: (nodePath, title, html) =>
    apiFetchPlain('/backup/open-in-word', { method: 'POST', body: { nodePath, title, html } }),

  wordSync: (nodePath, title) =>
    apiFetchPlain(`/backup/word-sync?nodePath=${encodeURIComponent(nodePath)}&title=${encodeURIComponent(title || nodePath)}`, {}),

  // ── היסטוריית גרסאות ─────────────────────────────────────────────────
  getHistory:     (nodePath) => apiFetch(`/summaries/history?path=${encodeURIComponent(nodePath)}`),
  restoreVersion: (nodePath, versionIndex) =>
    apiFetch('/summaries/history/restore', { method: 'POST', body: { nodePath, versionIndex } }),

  // ── מסייע AI ─────────────────────────────────────────────────────────────
  aiAsk: (context, userMessage, extra, selectedBooks) =>
    apiFetchPlain('/ai/ask', { method: 'POST', body: { context, userMessage, extra, selectedBooks } }),
  aiSuggestQuestions: (summaryContent, summaryTitle, existingQuestions, type) =>
    apiFetchPlain('/ai/suggest-questions', { method: 'POST', body: { summaryContent, summaryTitle, existingQuestions, type } }),
  aiScheduleAdvice: (heavyDays, totalTasks) =>
    apiFetchPlain('/ai/schedule-advice', { method: 'POST', body: { heavyDays, totalTasks } }),
  aiArticlesChat: (userMessage) =>
    apiFetchPlain('/ai/articles-chat', { method: 'POST', body: { userMessage } }),
  aiLearningProgram: (goals, daysPerWeek, hoursPerDay) =>
    apiFetchPlain('/ai/learning-program', { method: 'POST', body: { goals, daysPerWeek, hoursPerDay } }),
  aiGetKeys: () => apiFetchPlain('/ai/keys', {}),
  aiSaveKeys: (keys) => apiFetchPlain('/ai/keys', { method: 'PUT', body: { keys } }),
  aiKeyStatus: () => apiFetchPlain('/ai/key-status', {}),
  aiParseSrProgram: (hebrewText) =>
    apiFetchPlain('/ai/parse-sr-program', { method: 'POST', body: { hebrewText } }),
  aiSuggestSingleQuestion: (summaryPath, summaryTitle, type) =>
    apiFetchPlain('/ai/suggest-single-question', { method: 'POST', body: { summaryPath, summaryTitle, type } }),
  aiGradeAnswer: (question, sampleAnswer, userAnswer, strictness) =>
    apiFetchPlain('/ai/grade-answer', { method: 'POST', body: { question, sampleAnswer, userAnswer, strictness } }),
  aiSystemHelp: (userMessage) =>
    apiFetchPlain('/ai/system-help', { method: 'POST', body: { userMessage } }),

  // ── מאגר ספרים ───────────────────────────────────────────────────────────
  getBooks:      () => apiFetch('/books'),
  getBookStreamUrl: (name) => `/api/books/stream/${encodeURIComponent(name)}`,
  deleteBook:    (name) => apiFetch(`/books/${encodeURIComponent(name)}`, { method: 'DELETE' }),
  uploadBook: (file) => {
    const fd = new FormData();
    fd.append('pdf', file);
    return apiFormFetch('/books/upload', fd);
  },
};
