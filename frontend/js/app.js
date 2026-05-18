// נקודת כניסה ראשית של האפליקציה
document.addEventListener('DOMContentLoaded', () => {
  WindowManager.initOfflineDetection((isOffline) => AiManager.setOffline(isOffline));
  EditorManager.init();
  AiManager.init();
  BackupManager.init();
  PlanProgramModal.init();
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
      if (view === 'books')     BooksManager.init();
      if (view === 'dashboard') { CalendarManager.loadCalendar(); AiManager.setContext('calendar'); }
      if (view === 'settings')  { loadSrSettings(); loadAiScope(); loadPrograms(); AiManager.refreshBattery(); BackupManager.loadBackupList(); }
      if (view === 'help')      { /* static — no init needed */ }
    });
  });

  // כפתורי בחינה ושאלות בעורך
  document.getElementById('editorQuestionsBtn').addEventListener('click', () => {
    const node = EditorManager.getCurrentNode();
    if (!node) return;
    AiManager.setContext('quiz');
    QuizManager.openEditorDocked(node.path, node.title || node.path);
  });
  document.getElementById('editorQuizBtn').addEventListener('click', () => {
    const node = EditorManager.getCurrentNode();
    if (!node) return;
    QuizManager.startQuiz([node.path], node.title || node.path);
  });

  // תצוגת ברירת מחדל — מסך ראשי עם לוח שנה
  WindowManager.showView('dashboard');
  CalendarManager.init();
  _bindSrSettings();
  _bindAiScope();
  _bindProgramsPanel();
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
    const strictKodeshMode = document.getElementById('strictKodeshToggle')?.checked || false;
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
      await Api.saveScheduleSettings({ algorithm, customSequence, heavyLoadThreshold, calendarDisplayPreference, strictKodeshMode });
      const msg = document.getElementById('srSettingsSavedMsg');
      msg.classList.remove('hidden');
      setTimeout(() => msg.classList.add('hidden'), 2500);
      CalendarManager.setDisplayPref(calendarDisplayPreference);
      CalendarManager.loadCalendar();
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
    document.getElementById('srCustomSeqGroup').style.display =
      s.algorithm === 'custom' ? '' : 'none';
    const calPrefEl = document.getElementById('calDisplayPref');
    if (calPrefEl && s.calendarDisplayPreference) {
      calPrefEl.value = s.calendarDisplayPreference;
    }
    const toggleEl = document.getElementById('strictKodeshToggle');
    if (toggleEl) toggleEl.checked = !!s.strictKodeshMode;
  } catch { /* fail silently */ }
}

// ─── היקף ידע AI ─────────────────────────────────────────────────────────────

function _bindAiScope() {
  document.getElementById('saveAiScopeBtn').addEventListener('click', async () => {
    const aiScopePreference = document.getElementById('aiScopeSelect')?.value || 'unlimited';
    try {
      await Api.saveScheduleSettings({ aiScopePreference });
      const msg = document.getElementById('aiScopeSavedMsg');
      msg.classList.remove('hidden');
      setTimeout(() => msg.classList.add('hidden'), 2500);
    } catch (err) {
      alert(`שגיאה בשמירה: ${err.message}`);
    }
  });
}

async function loadAiScope() {
  try {
    const s = await Api.getScheduleSettings();
    const el = document.getElementById('aiScopeSelect');
    if (el && s.aiScopePreference) el.value = s.aiScopePreference;
  } catch { /* fail silently */ }
}

// ─── תוכניות חזרה מרווחת ──────────────────────────────────────────────────────

function _bindProgramsPanel() {
  document.getElementById('addProgramBtn').addEventListener('click', _addProgram);
  document.getElementById('aiParseProgramBtn').addEventListener('click', _aiParseProgram);
}

async function loadPrograms() {
  const list = document.getElementById('programsList');
  list.innerHTML = '<p class="placeholder-text">טוען...</p>';
  try {
    const programs = await Api.getPrograms();
    if (!programs.length) {
      list.innerHTML = '<p class="placeholder-text">אין תוכניות</p>';
      return;
    }
    list.innerHTML = programs.map(p => `
      <div class="program-item">
        <span class="program-item__name">${escHtml(p.name)}</span>
        <span class="program-item__seq">[${(p.sequence || []).join(', ')}]</span>
        <span class="program-item__usage">שימושים: ${p.usageCount || 0}</span>
        ${p.id !== 'default'
          ? `<button class="btn btn--xs btn--danger-ghost" data-prog-id="${escHtml(p.id)}" onclick="deleteProgram(this.dataset.progId)">🗑️</button>`
          : '<span class="badge badge--info" style="font-size:0.7rem">בסיסי</span>'}
      </div>`).join('');
  } catch (err) {
    list.innerHTML = `<p class="placeholder-text error-text">שגיאה: ${escHtml(err.message)}</p>`;
  }
}

async function deleteProgram(id) {
  const ok = await WindowManager.confirm('האם למחוק תוכנית חזרה זו?');
  if (!ok) return;
  try {
    await Api.deleteProgram(id);
    await loadPrograms();
  } catch (err) {
    alert(`שגיאה: ${err.message}`);
  }
}

async function _addProgram() {
  const name    = document.getElementById('newProgramName').value.trim();
  const seqRaw  = document.getElementById('newProgramSeq').value;
  const sequence = seqRaw.split(',').map(s => parseInt(s.trim(), 10)).filter(n => n > 0);

  if (!name) { alert('יש להזין שם לתוכנית'); return; }
  if (!sequence.length) { alert('יש להזין רצף ימים תקין'); return; }

  const btn = document.getElementById('addProgramBtn');
  btn.disabled = true;
  try {
    await Api.createProgram(name, sequence);
    document.getElementById('newProgramName').value  = '';
    document.getElementById('newProgramSeq').value   = '';
    document.getElementById('aiProgramText').value   = '';
    document.getElementById('aiProgramHint').textContent = '';
    await loadPrograms();
    const msg = document.getElementById('addProgramMsg');
    msg.textContent = 'נשמר ✓';
    msg.className   = 'save-status save-status--saved';
    msg.classList.remove('hidden');
    setTimeout(() => msg.classList.add('hidden'), 2000);
  } catch (err) {
    alert(`שגיאה: ${err.message}`);
  } finally {
    btn.disabled = false;
  }
}

async function _aiParseProgram() {
  const text = document.getElementById('aiProgramText').value.trim();
  if (!text) { alert('הזן תיאור בעברית'); return; }

  const btn  = document.getElementById('aiParseProgramBtn');
  const hint = document.getElementById('aiProgramHint');
  btn.disabled = true;
  hint.textContent = '⏳ ה-AI מנתח...';

  try {
    const { sequence } = await Api.aiParseSrProgram(text);
    document.getElementById('newProgramSeq').value = sequence.join(', ');
    hint.textContent = `✓ רצף שהתקבל: [${sequence.join(', ')}]`;
  } catch (err) {
    hint.textContent = `שגיאה: ${err.message}`;
  } finally {
    btn.disabled = false;
  }
}

// ─── מודל בחירת תוכנית — global module ───────────────────────────────────────

const PlanProgramModal = (() => {
  let _resolve = null;
  let _nodePath = '';
  let _nodeName = '';

  function init() {
    document.getElementById('planProgramCancelBtn').addEventListener('click', () => _close(false));
    document.getElementById('planProgramModal').querySelector('.modal__overlay')
      .addEventListener('click', () => _close(false));
    document.getElementById('planProgramConfirmBtn').addEventListener('click', _confirm);
  }

  async function open(nodePath, nodeName) {
    _nodePath = nodePath;
    _nodeName = nodeName;

    document.getElementById('planProgramDesc').textContent =
      `בחר תוכנית חזרה לסיכום "${nodeName}"`;

    const sel = document.getElementById('planProgramSelect');
    sel.innerHTML = '<option value="">טוען...</option>';
    document.getElementById('planProgramModal').classList.remove('hidden');

    try {
      const programs = await Api.getPrograms();
      sel.innerHTML = programs.map(p =>
        `<option value="${escHtml(p.id)}">${escHtml(p.name)} [${(p.sequence || []).join(',')}]</option>`
      ).join('');
    } catch {
      sel.innerHTML = '<option value="default">ברירת מחדל</option>';
    }
  }

  async function _confirm() {
    const programId = document.getElementById('planProgramSelect').value || 'default';
    _close(true);
    try {
      const tasks = await Api.planSummary(_nodePath, _nodeName, programId);
      alert(`✓ תוזמנו ${tasks.length} משימות חזרה לסיכום "${_nodeName}"`);
    } catch (err) {
      alert(`שגיאה: ${err.message}`);
    }
  }

  function _close(result) {
    document.getElementById('planProgramModal').classList.add('hidden');
    if (_resolve) { _resolve(result); _resolve = null; }
  }

  return { init, open };
})();

// ─── עזר גלובלי ───────────────────────────────────────────────────────────────

async function loadKeyCount() {
  try { await Api.health(); } catch {}
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
