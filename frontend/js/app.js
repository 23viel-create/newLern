// נקודת כניסה ראשית של האפליקציה
document.addEventListener('DOMContentLoaded', () => {
  WindowManager.initOfflineDetection((isOffline) => AiManager.setOffline(isOffline));
  EditorManager.init();
  AiManager.init();
  BackupManager.init();
  loadKeyCount();

  // ניווט בין תצוגות
  document.querySelectorAll('.nav-link').forEach((link) => {
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      const view = link.dataset.view;
      // שמור תוכן עורך לפני מעבר
      if (document.body.classList.contains('editor-open')) {
        EditorManager.clear();
      }
      document.body.classList.remove('editor-open');
      WindowManager.showView(view);
      if (view === 'summaries') SummariesManager.init();
      if (view === 'dashboard') { CalendarManager.init(); AiManager.setContext('calendar'); }
      if (view === 'settings')  { loadSrSettings(); AiManager.refreshBattery(); BackupManager.loadBackupList(); }
      if (view === 'help')      { /* static — no init needed */ }
    });
  });

  // כפתורי בחינה ושאלות בעורך
  document.getElementById('editorQuestionsBtn').addEventListener('click', () => {
    const node = EditorManager.getCurrentNode();
    if (!node) return;
    AiManager.setContext('quiz');
    QuizManager.openEditor(node.path, node.title || node.path);
  });
  document.getElementById('editorQuizBtn').addEventListener('click', () => {
    const node = EditorManager.getCurrentNode();
    if (!node) return;
    QuizManager.startQuiz([node.path], node.title || node.path);
  });

  // תצוגת ברירת מחדל — לוח בקרה עם לוח שנה
  WindowManager.showView('dashboard');
  CalendarManager.init();
  _bindSrSettings();
});

// ─── הגדרות חזרה מרווחת ──────────────────────────────────────────────────────

function _bindSrSettings() {
  const algoSel  = document.getElementById('srAlgorithm');
  const seqGroup = document.getElementById('srCustomSeqGroup');

  function toggleSeqGroup() {
    seqGroup.style.display = algoSel.value === 'custom' ? '' : 'none';
  }
  algoSel.addEventListener('change', toggleSeqGroup);

  document.getElementById('saveSrSettingsBtn').addEventListener('click', async () => {
    const algorithm = algoSel.value;
    const heavyLoadThreshold = parseInt(document.getElementById('srHeavyLoad').value, 10) || 9;
    const calendarDisplayPreference = document.getElementById('calDisplayPref')?.value || 'combined';
    let customSequence;

    if (algorithm === 'custom') {
      const raw = document.getElementById('srCustomSeq').value;
      customSequence = raw.split(',').map(s => parseInt(s.trim(), 10)).filter(n => n > 0);
      if (!customSequence.length) {
        alert('יש להזין לפחות ערך אחד ברצף המותאם');
        return;
      }
    }

    try {
      await Api.saveScheduleSettings({ algorithm, customSequence, heavyLoadThreshold, calendarDisplayPreference });
      const msg = document.getElementById('srSettingsSavedMsg');
      msg.classList.remove('hidden');
      setTimeout(() => msg.classList.add('hidden'), 2500);
      CalendarManager.setDisplayPref(calendarDisplayPreference);
      CalendarManager.loadCalendar(); // refresh color coding
    } catch (err) {
      alert(`שגיאה בשמירת הגדרות: ${err.message}`);
    }
  });
}

async function loadSrSettings() {
  try {
    const s = await Api.getScheduleSettings();
    document.getElementById('srAlgorithm').value = s.algorithm || 'powers2';
    document.getElementById('srHeavyLoad').value  = s.heavyLoadThreshold ?? 9;
    if (s.customSequence) {
      document.getElementById('srCustomSeq').value = s.customSequence.join(', ');
    }
    // Show/hide custom sequence group
    document.getElementById('srCustomSeqGroup').style.display =
      s.algorithm === 'custom' ? '' : 'none';
    // Calendar display preference
    const calPrefEl = document.getElementById('calDisplayPref');
    if (calPrefEl && s.calendarDisplayPreference) {
      calPrefEl.value = s.calendarDisplayPreference;
    }
  } catch { /* fail silently */ }
}

// ─── עזר גלובלי ───────────────────────────────────────────────────────────────

async function loadKeyCount() {
  try { await Api.health(); } catch {}
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
