// שכבת תקשורת עם ה-API המקומי
const API_BASE = '/api';

async function apiFetch(endpoint, options = {}) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || 'שגיאה בתקשורת עם השרת');
  return data.data;
}

const Api = {
  // ── כללי ──────────────────────────────────────────
  health: () => apiFetch('/health'),

  // ── עץ סיכומים ────────────────────────────────────
  getTree:       ()                        => apiFetch('/summaries/tree'),
  createFolder:  (parentPath, name)        => apiFetch('/summaries/folder',  { method: 'POST',   body: { parentPath, name } }),
  createSummary: (parentPath, name)        => apiFetch('/summaries/summary', { method: 'POST',   body: { parentPath, name } }),
  renameNode:    (nodePath, newName)       => apiFetch('/summaries/rename',  { method: 'PATCH',  body: { nodePath, newName } }),
  deleteNode:    (nodePath)               => apiFetch('/summaries/node',    { method: 'DELETE', body: { nodePath } }),
  getContent:    (nodePath)               => apiFetch(`/summaries/content?path=${encodeURIComponent(nodePath)}`),
  saveContent:   (nodePath, text)         => apiFetch('/summaries/content',  { method: 'PUT',    body: { nodePath, text } }),

  // ── לוח זמנים ─────────────────────────────────────
  getSchedule:  ()             => apiFetch('/schedule'),
  getTodayTasks: ()            => apiFetch('/schedule/today'),
  completeTask: (id, quality)  => apiFetch(`/schedule/${id}/complete`, { method: 'PATCH', body: { quality } }),

  // ── חידונים ───────────────────────────────────────
  generateQuiz:  (text) => apiFetch('/quizzes/multiple-choice', { method: 'POST', body: { summaryText: text } }),
  generateOpenQ: (text) => apiFetch('/quizzes/open-questions',  { method: 'POST', body: { summaryText: text } }),
};
