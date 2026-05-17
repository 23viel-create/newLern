// נקודת כניסה ראשית של האפליקציה
document.addEventListener('DOMContentLoaded', () => {
  WindowManager.initOfflineDetection();
  loadKeyCount();

  // ניווט
  document.querySelectorAll('.nav-link').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      WindowManager.showView(link.dataset.view);
    });
  });

  // טעינת לוח הבקרה בפתיחה
  WindowManager.showView('dashboard');
  loadTodayTasks();
});

async function loadTodayTasks() {
  const container = document.getElementById('todayTasks');
  try {
    const tasks = await Api.getTodayTasks();
    if (!tasks.length) {
      container.innerHTML = '<p class="placeholder-text">אין משימות להיום — כל הכבוד! 🎉</p>';
      return;
    }
    container.innerHTML = tasks.map((t) => `
      <div class="card">
        <h3>${t.title || t.id}</h3>
        <p class="hint">מועד: ${t.dueDate}</p>
        <button class="btn btn--primary" onclick="markDone('${t.id}')">סיימתי</button>
      </div>
    `).join('');
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
  try {
    await Api.health();
    // TODO: endpoint /api/ai/status יוחזר בשלב הבא
  } catch {
    // השרת אינו זמין
  }
}
