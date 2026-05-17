// שכבת תקשורת עם ה-API המקומי
const API_BASE = '/api';

async function apiFetch(endpoint, options = {}) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || 'שגיאה בתקשורת עם השרת');
  return data.data;
}

const Api = {
  health:            ()           => apiFetch('/health'),
  getSummaries:      (parentId)   => apiFetch(`/summaries${parentId ? `?parentId=${parentId}` : ''}`),
  createSummary:     (summaryId)  => apiFetch('/summaries', { method: 'POST', body: { summaryId } }),
  deleteSummary:     (id)         => apiFetch(`/summaries/${id}`, { method: 'DELETE' }),
  getSchedule:       ()           => apiFetch('/schedule'),
  getTodayTasks:     ()           => apiFetch('/schedule/today'),
  completeTask:      (id, quality)=> apiFetch(`/schedule/${id}/complete`, { method: 'PATCH', body: { quality } }),
  generateQuiz:      (text)       => apiFetch('/quizzes/multiple-choice', { method: 'POST', body: { summaryText: text } }),
  generateOpenQ:     (text)       => apiFetch('/quizzes/open-questions', { method: 'POST', body: { summaryText: text } }),
};
