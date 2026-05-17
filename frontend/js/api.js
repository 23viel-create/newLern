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
  getSchedule:  ()              => apiFetch('/schedule'),
  getTodayTasks: ()             => apiFetch('/schedule/today'),
  completeTask: (id, quality)   => apiFetch(`/schedule/${id}/complete`, { method: 'PATCH', body: { quality } }),

  // ── חידונים ──────────────────────────────────────────────────────────────
  generateQuiz:  (text) => apiFetch('/quizzes/multiple-choice', { method: 'POST', body: { summaryText: text } }),
  generateOpenQ: (text) => apiFetch('/quizzes/open-questions',  { method: 'POST', body: { summaryText: text } }),
};
