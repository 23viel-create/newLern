// נקודת כניסה ראשית של האפליקציה
document.addEventListener('DOMContentLoaded', () => {
  WindowManager.initOfflineDetection();
  EditorManager.init();
  loadKeyCount();

  // ניווט בין תצוגות
  document.querySelectorAll('.nav-link').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const view = link.dataset.view;
      document.body.classList.remove('editor-open');
      WindowManager.showView(view);
      if (view === 'summaries') SummariesManager.init();
    });
  });

  // תצוגת ברירת מחדל
  WindowManager.showView('dashboard');
  loadTodayTasks();
});

// ─── לוח בקרה ─────────────────────────────────────────────────────────────────

async function loadTodayTasks() {
  const container = document.getElementById('todayTasks');
  try {
    const tasks = await Api.getTodayTasks();
    if (!tasks.length) {
      container.innerHTML = '<p class="placeholder-text">אין משימות להיום — כל הכבוד! 🎉</p>';
      return;
    }
    container.innerHTML = tasks
      .map((t) => `
        <div class="card">
          <h3>${escHtml(t.title || t.id)}</h3>
          <p class="hint">מועד: ${escHtml(t.dueDate)}</p>
          <button class="btn btn--primary" onclick="markDone('${escHtml(t.id)}')">סיימתי ✓</button>
        </div>`)
      .join('');
  } catch {
    container.innerHTML = '<p class="placeholder-text">לא ניתן לטעון משימות</p>';
  }
}

async function markDone(taskId) {
  try {
    await Api.completeTask(taskId, 3);
    loadTodayTasks();
  } catch (err) {
    alert(`שגיאה: ${err.message}`);
  }
}

async function loadKeyCount() {
  try { await Api.health(); } catch {}
}

// ─── עזר גלובלי ───────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
