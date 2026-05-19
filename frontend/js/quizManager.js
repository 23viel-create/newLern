// מנהל השאלות, עורך השאלות, ומסך הבחינה
const QuizManager = (() => {

  // ─── Editor state (modal, from summaries tree) ───────────────────────────
  let _edPath  = null;
  let _edTitle = null;
  let _edData  = { open: [], mc: [] };
  let _edTab   = 'open';
  let _editingId   = null;  // question id being edited, or null for new
  let _editingType = null;  // 'open' | 'mc'

  // ─── Dock panel state (from editor view) ─────────────────────────────────
  let _ddPath  = null;
  let _ddTitle = null;
  let _ddData  = { open: [], mc: [] };
  let _ddTab   = 'open';
  let _ddEditingId   = null;
  let _ddEditingType = null;

  // ─── Quiz state ───────────────────────────────────────────────────────────
  let _quizQs       = [];    // shuffled bundle from server
  let _answers      = [];    // per-question answer tracking
  let _config       = { layout: 'one', feedback: 'instant', aiGrade: false, strictness: 'בינונית' };
  let _curIdx       = 0;
  let _quizTitle    = '';
  let _revealed     = new Set();  // indices whose open answer has been shown
  let _previousView = 'dashboard'; // view to return to when quiz closes

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _pct(v) { return v == null ? '—' : Math.round(v * 100) + '%'; }

  // Fisher-Yates in-place shuffle — returns new array
  function _shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Save any typed open-answer textarea to _answers before re-render
  function _captureOpenAnswers() {
    document.querySelectorAll('.quiz-open-textarea[data-idx]').forEach(ta => {
      const idx = parseInt(ta.dataset.idx, 10);
      if (!isNaN(idx) && _answers[idx]) {
        _answers[idx].userText = ta.value;
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  QUESTION EDITOR (modal — from summaries tree)
  // ═══════════════════════════════════════════════════════════════════════════

  async function openEditor(summaryPath, summaryTitle) {
    _edPath  = summaryPath;
    _edTitle = summaryTitle;
    _editingId   = null;
    _editingType = null;
    _edTab   = 'open';

    document.getElementById('qeTitle').textContent = summaryTitle;
    document.getElementById('qeModal').classList.remove('hidden');

    await _loadEditorQuestions();
    _renderEditorTab();
    _bindEditorEvents();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  DOCKED QUESTION EDITOR (inside #view-editor)
  // ═══════════════════════════════════════════════════════════════════════════

  async function openEditorDocked(summaryPath, summaryTitle) {
    _ddPath  = summaryPath;
    _ddTitle = summaryTitle;
    _ddEditingId   = null;
    _ddEditingType = null;
    _ddTab   = 'open';

    document.getElementById('qdTitle').textContent = summaryTitle;
    const panel = document.getElementById('qeDockPanel');

    if (panel.classList.contains('hidden')) {
      panel.classList.remove('hidden');
    }

    await _loadDockQuestions();
    _renderDockTab();
    _bindDockEvents();
  }

  async function _loadDockQuestions() {
    try {
      _ddData = await Api.getQuizQuestions(_ddPath);
    } catch (err) {
      _ddData = { open: [], mc: [] };
      console.error('שגיאה בטעינת שאלות:', err.message);
    }
  }

  function _bindDockEvents() {
    document.querySelectorAll('[data-qdtab]').forEach(btn => {
      btn.onclick = () => {
        _ddTab = btn.dataset.qdtab;
        document.querySelectorAll('[data-qdtab]').forEach(b =>
          b.classList.toggle('qe-tab--active', b === btn));
        _renderDockTab();
      };
    });

    document.getElementById('qdCloseBtn').onclick   = _closeDock;
    document.getElementById('qdAddOpenBtn').onclick  = () => _showDockForm('open', null);
    document.getElementById('qdAddMcBtn').onclick    = () => _showDockForm('mc',   null);
  }

  function _closeDock() {
    document.getElementById('qeDockPanel').classList.add('hidden');
    document.getElementById('qdForm').classList.add('hidden');
    document.getElementById('qdForm').innerHTML = '';
    _ddPath        = null;
    _ddEditingId   = null;
    _ddEditingType = null;
  }

  function _renderDockTab() {
    document.getElementById('qdOpenCount').textContent = _ddData.open.length;
    document.getElementById('qdMcCount'  ).textContent = _ddData.mc.length;

    const showOpen = _ddTab === 'open';
    document.getElementById('qdTabOpen').classList.toggle('hidden', !showOpen);
    document.getElementById('qdTabMc'  ).classList.toggle('hidden',  showOpen);

    _renderDockList('open');
    _renderDockList('mc');
  }

  function _renderDockList(type) {
    const container = document.getElementById(type === 'open' ? 'qdOpenList' : 'qdMcList');
    const questions = _ddData[type];

    if (!questions.length) {
      container.innerHTML = `<p class="placeholder-text">אין שאלות ${type === 'open' ? 'פתוחות' : 'בחירה מרובה'} עדיין</p>`;
      return;
    }

    container.innerHTML = questions.map((q, i) => `
      <div class="qe-item" data-ddid="${_esc(q.id)}" data-ddtype="${type}">
        <div class="qe-item__body">
          <span class="qe-item__num">${i + 1}.</span>
          <span class="qe-item__text">${_esc(q.question)}</span>
          ${q.success_rate != null ? `<span class="qe-item__rate">${_pct(q.success_rate)}</span>` : ''}
        </div>
        <div class="qe-item__actions">
          <button class="btn btn--xs btn--ghost qd-edit-btn" data-id="${_esc(q.id)}" data-type="${type}">✏️</button>
          <button class="btn btn--xs btn--danger-ghost qd-del-btn"  data-id="${_esc(q.id)}" data-type="${type}">🗑️</button>
        </div>
      </div>`).join('');

    container.querySelectorAll('.qd-edit-btn').forEach(btn => {
      btn.onclick = () => {
        const q = questions.find(q => q.id === btn.dataset.id);
        if (q) _showDockForm(btn.dataset.type, q);
      };
    });
    container.querySelectorAll('.qd-del-btn').forEach(btn => {
      btn.onclick = () => _deleteDockQ(btn.dataset.type, btn.dataset.id);
    });
  }

  function _showDockForm(type, existingQ) {
    _ddEditingType = type;
    _ddEditingId   = existingQ?.id || null;

    const formEl = document.getElementById('qdForm');
    formEl.classList.remove('hidden');

    if (type === 'open') {
      formEl.innerHTML = `
        <h4 class="qe-form-title">${existingQ ? 'עריכת' : 'הוספת'} שאלה פתוחה</h4>
        <div class="form-group">
          <label class="form-label">שאלה *</label>
          <textarea id="qdfOpenQ" class="input-field input-field--full" rows="2"
            placeholder="הזן את השאלה...">${_esc(existingQ?.question || '')}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">תשובה</label>
          <textarea id="qdfOpenA" class="input-field input-field--full" rows="3"
            placeholder="הזן תשובה מפורטת...">${_esc(existingQ?.answer || '')}</textarea>
        </div>
        <div class="form-row-actions">
          <button id="qdfSaveBtn" class="btn btn--primary btn--sm">שמור</button>
          <button id="qdfAiSuggestBtn" class="btn btn--ghost btn--sm qf-ai-suggest-btn">🪄 AI</button>
          <button id="qdfCancelBtn" class="btn btn--secondary btn--sm">ביטול</button>
        </div>
        <div id="qdfAiStatus" class="qf-ai-status hidden"></div>`;
      document.getElementById('qdfSaveBtn').onclick   = _saveDockOpenQ;
      document.getElementById('qdfCancelBtn').onclick = _hideDockForm;
      document.getElementById('qdfAiSuggestBtn').onclick = () => _aiSuggestDockQuestion('open');
      document.getElementById('qdfOpenQ').focus();
    } else {
      const opts    = existingQ?.options || ['', '', '', ''];
      const correct = existingQ?.correct_option_index ?? 0;
      const optRows = opts.map((o, i) => `
        <div class="mc-opt-row">
          <label class="mc-opt-label">
            <input type="radio" name="qdfCorrect" value="${i}" ${i === correct ? 'checked' : ''} />
            <input type="text" class="input-field mc-opt-input" id="qdfOpt${i}"
              placeholder="אפשרות ${i+1}" value="${_esc(o)}" />
          </label>
        </div>`).join('');

      formEl.innerHTML = `
        <h4 class="qe-form-title">${existingQ ? 'עריכת' : 'הוספת'} שאלת בחירה מרובה</h4>
        <div class="form-group">
          <label class="form-label">שאלה *</label>
          <textarea id="qdfMcQ" class="input-field input-field--full" rows="2"
            placeholder="הזן את השאלה...">${_esc(existingQ?.question || '')}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">אפשרויות (● = נכון)</label>
          <div class="mc-opts-form">${optRows}</div>
        </div>
        <div class="form-row-actions">
          <button id="qdfSaveBtn" class="btn btn--primary btn--sm">שמור</button>
          <button id="qdfAiSuggestBtn" class="btn btn--ghost btn--sm qf-ai-suggest-btn">🪄 AI</button>
          <button id="qdfCancelBtn" class="btn btn--secondary btn--sm">ביטול</button>
        </div>
        <div id="qdfAiStatus" class="qf-ai-status hidden"></div>`;
      document.getElementById('qdfSaveBtn').onclick   = _saveDockMcQ;
      document.getElementById('qdfCancelBtn').onclick = _hideDockForm;
      document.getElementById('qdfAiSuggestBtn').onclick = () => _aiSuggestDockQuestion('mc');
      document.getElementById('qdfMcQ').focus();
    }
    formEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  async function _aiSuggestDockQuestion(type) {
    const btn    = document.getElementById('qdfAiSuggestBtn');
    const status = document.getElementById('qdfAiStatus');
    if (!btn || !status) return;
    btn.disabled = true;
    status.textContent = '⏳ ה-AI מייצר שאלה...';
    status.classList.remove('hidden');
    try {
      const result = await Api.aiSuggestSingleQuestion(_ddPath, _ddTitle, type);
      if (type === 'open') {
        document.getElementById('qdfOpenQ').value = result.question || '';
        document.getElementById('qdfOpenA').value = result.answer  || '';
      } else {
        document.getElementById('qdfMcQ').value = result.question || '';
        const opts = result.options || [];
        for (let i = 0; i < 4; i++) {
          const el = document.getElementById(`qdfOpt${i}`);
          if (el) el.value = opts[i] || '';
        }
        const correctIdx = typeof result.correct_option_index === 'number' ? result.correct_option_index : 0;
        const radio = document.querySelector(`input[name="qdfCorrect"][value="${correctIdx}"]`);
        if (radio) radio.checked = true;
      }
      status.textContent = '✓ נוצרה שאלה — ערוך ולחץ שמור';
    } catch (err) {
      status.textContent = `שגיאה: ${err.message}`;
    } finally {
      btn.disabled = false;
    }
  }

  function _hideDockForm() {
    document.getElementById('qdForm').classList.add('hidden');
    document.getElementById('qdForm').innerHTML = '';
    _ddEditingId   = null;
    _ddEditingType = null;
  }

  async function _saveDockOpenQ() {
    const question = document.getElementById('qdfOpenQ').value.trim();
    const answer   = document.getElementById('qdfOpenA').value.trim();
    if (!question) { alert('יש להזין שאלה'); return; }
    try {
      if (_ddEditingId) {
        await Api.updateOpenQuestion(_ddPath, _ddEditingId, question, answer);
      } else {
        await Api.addOpenQuestion(_ddPath, question, answer);
      }
      await _loadDockQuestions();
      _renderDockTab();
      _hideDockForm();
    } catch (err) { alert(`שגיאה: ${err.message}`); }
  }

  async function _saveDockMcQ() {
    const question = document.getElementById('qdfMcQ').value.trim();
    if (!question) { alert('יש להזין שאלה'); return; }
    const options = [0,1,2,3].map(i => (document.getElementById(`qdfOpt${i}`)?.value || '').trim()).filter(Boolean);
    if (options.length < 2) { alert('יש להזין לפחות 2 אפשרויות'); return; }
    const correctRaw = document.querySelector('input[name="qdfCorrect"]:checked')?.value;
    const correct    = correctRaw != null ? parseInt(correctRaw, 10) : 0;
    const corrAdj    = Math.min(correct, options.length - 1);
    try {
      if (_ddEditingId) {
        await Api.updateMcQuestion(_ddPath, _ddEditingId, question, options, corrAdj);
      } else {
        await Api.addMcQuestion(_ddPath, question, options, corrAdj);
      }
      await _loadDockQuestions();
      _renderDockTab();
      _hideDockForm();
    } catch (err) { alert(`שגיאה: ${err.message}`); }
  }

  async function _deleteDockQ(type, id) {
    const q = _ddData[type].find(q => q.id === id);
    if (!q) return;
    const ok = await WindowManager.confirm(`למחוק את השאלה "${q.question.slice(0,60)}"?`);
    if (!ok) return;
    try {
      if (type === 'open') await Api.deleteOpenQuestion(_ddPath, id);
      else                 await Api.deleteMcQuestion(_ddPath, id);
      await _loadDockQuestions();
      _renderDockTab();
      _hideDockForm();
    } catch (err) { alert(`שגיאה: ${err.message}`); }
  }

  async function _loadEditorQuestions() {
    try {
      _edData = await Api.getQuizQuestions(_edPath);
    } catch (err) {
      _edData = { open: [], mc: [] };
      console.error('שגיאה בטעינת שאלות:', err.message);
    }
  }

  function _bindEditorEvents() {
    // Tab switching
    document.querySelectorAll('.qe-tab').forEach(btn => {
      btn.onclick = () => {
        _edTab = btn.dataset.tab;
        document.querySelectorAll('.qe-tab').forEach(b => b.classList.toggle('qe-tab--active', b === btn));
        _renderEditorTab();
      };
    });

    document.getElementById('qeCloseBtn').onclick = _closeEditor;
    document.getElementById('qeModal').querySelector('.modal__overlay').onclick = _closeEditor;
    document.getElementById('qeAddOpenBtn').onclick  = () => _showForm('open',  null);
    document.getElementById('qeAddMcBtn').onclick    = () => _showForm('mc',    null);
  }

  function _closeEditor() {
    document.getElementById('qeModal').classList.add('hidden');
    _edPath = null;
    _hideForm();
  }

  function _renderEditorTab() {
    document.getElementById('qeOpenCount').textContent = _edData.open.length;
    document.getElementById('qeMcCount'  ).textContent = _edData.mc.length;

    const showOpen = _edTab === 'open';
    document.getElementById('qeTabOpen').classList.toggle('hidden', !showOpen);
    document.getElementById('qeTabMc'  ).classList.toggle('hidden',  showOpen);

    _renderList('open');
    _renderList('mc');
  }

  function _renderList(type) {
    const container = document.getElementById(type === 'open' ? 'qeOpenList' : 'qeMcList');
    const questions = _edData[type];

    if (!questions.length) {
      container.innerHTML = `<p class="placeholder-text">אין שאלות ${type === 'open' ? 'פתוחות' : 'בחירה מרובה'} עדיין</p>`;
      return;
    }

    container.innerHTML = questions.map((q, i) => `
      <div class="qe-item" data-id="${_esc(q.id)}" data-type="${type}">
        <div class="qe-item__body">
          <span class="qe-item__num">${i + 1}.</span>
          <span class="qe-item__text">${_esc(q.question)}</span>
          ${q.success_rate != null ? `<span class="qe-item__rate">${_pct(q.success_rate)}</span>` : ''}
        </div>
        <div class="qe-item__actions">
          <button class="btn btn--xs btn--ghost qe-edit-btn" data-id="${_esc(q.id)}" data-type="${type}">✏️</button>
          <button class="btn btn--xs btn--danger-ghost qe-del-btn"  data-id="${_esc(q.id)}" data-type="${type}">🗑️</button>
        </div>
      </div>`).join('');

    container.querySelectorAll('.qe-edit-btn').forEach(btn => {
      btn.onclick = () => {
        const q = questions.find(q => q.id === btn.dataset.id);
        if (q) _showForm(btn.dataset.type, q);
      };
    });
    container.querySelectorAll('.qe-del-btn').forEach(btn => {
      btn.onclick = () => _deleteQ(btn.dataset.type, btn.dataset.id);
    });
  }

  function _showForm(type, existingQ) {
    _editingType = type;
    _editingId   = existingQ?.id || null;

    const formEl = document.getElementById('qeForm');
    formEl.classList.remove('hidden');

    if (type === 'open') {
      formEl.innerHTML = `
        <h4 class="qe-form-title">${existingQ ? 'עריכת' : 'הוספת'} שאלה פתוחה</h4>
        <div class="form-group">
          <label class="form-label">שאלה *</label>
          <textarea id="qfOpenQ" class="input-field input-field--full" rows="3"
            placeholder="הזן את השאלה...">${_esc(existingQ?.question || '')}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">תשובה / הנחיות לבודק</label>
          <textarea id="qfOpenA" class="input-field input-field--full" rows="4"
            placeholder="הזן תשובה מפורטת שתוצג לתלמיד בזמן הבחינה...">${_esc(existingQ?.answer || '')}</textarea>
        </div>
        <div class="form-row-actions">
          <button id="qfSaveBtn" class="btn btn--primary">שמור שאלה</button>
          <button id="qfAiSuggestBtn" class="btn btn--ghost btn--sm qf-ai-suggest-btn">🪄 הצעה לשאלה מה-AI</button>
          <button id="qfCancelBtn" class="btn btn--secondary">ביטול</button>
        </div>
        <div id="qfAiStatus" class="qf-ai-status hidden"></div>`;
      document.getElementById('qfSaveBtn').onclick   = _saveOpenQ;
      document.getElementById('qfCancelBtn').onclick = _hideForm;
      document.getElementById('qfAiSuggestBtn').onclick = () => _aiSuggestQuestion('open');
      document.getElementById('qfOpenQ').focus();

    } else {
      // Build 4 option rows (pre-filled if editing)
      const opts = existingQ?.options || ['', '', '', ''];
      const correct = existingQ?.correct_option_index ?? 0;
      const optRows = opts.map((o, i) => `
        <div class="mc-opt-row">
          <label class="mc-opt-label">
            <input type="radio" name="qfCorrect" value="${i}" ${i === correct ? 'checked' : ''} />
            <input type="text" class="input-field mc-opt-input" id="qfOpt${i}"
              placeholder="אפשרות ${i+1}" value="${_esc(o)}" />
          </label>
        </div>`).join('');

      formEl.innerHTML = `
        <h4 class="qe-form-title">${existingQ ? 'עריכת' : 'הוספת'} שאלת בחירה מרובה</h4>
        <div class="form-group">
          <label class="form-label">שאלה *</label>
          <textarea id="qfMcQ" class="input-field input-field--full" rows="3"
            placeholder="הזן את השאלה...">${_esc(existingQ?.question || '')}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">אפשרויות (סמן ● את התשובה הנכונה)</label>
          <div class="mc-opts-form">${optRows}</div>
          <p class="hint">לפחות 2 אפשרויות נדרשות</p>
        </div>
        <div class="form-row-actions">
          <button id="qfSaveBtn" class="btn btn--primary">שמור שאלה</button>
          <button id="qfAiSuggestBtn" class="btn btn--ghost btn--sm qf-ai-suggest-btn">🪄 הצעה לשאלה מה-AI</button>
          <button id="qfCancelBtn" class="btn btn--secondary">ביטול</button>
        </div>
        <div id="qfAiStatus" class="qf-ai-status hidden"></div>`;
      document.getElementById('qfSaveBtn').onclick   = _saveMcQ;
      document.getElementById('qfCancelBtn').onclick = _hideForm;
      document.getElementById('qfAiSuggestBtn').onclick = () => _aiSuggestQuestion('mc');
      document.getElementById('qfMcQ').focus();
    }

    formEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  async function _aiSuggestQuestion(type) {
    const btn    = document.getElementById('qfAiSuggestBtn');
    const status = document.getElementById('qfAiStatus');
    if (!btn || !status) return;
    btn.disabled = true;
    status.textContent = '⏳ ה-AI מייצר שאלה...';
    status.classList.remove('hidden');

    try {
      const result = await Api.aiSuggestSingleQuestion(_edPath, _edTitle, type);
      if (type === 'open') {
        document.getElementById('qfOpenQ').value = result.question || '';
        document.getElementById('qfOpenA').value = result.answer  || '';
      } else {
        document.getElementById('qfMcQ').value = result.question || '';
        const opts = result.options || [];
        for (let i = 0; i < 4; i++) {
          const el = document.getElementById(`qfOpt${i}`);
          if (el) el.value = opts[i] || '';
        }
        const correctIdx = typeof result.correct_option_index === 'number' ? result.correct_option_index : 0;
        const radio = document.querySelector(`input[name="qfCorrect"][value="${correctIdx}"]`);
        if (radio) radio.checked = true;
      }
      status.textContent = '✓ הוצאה שאלה מה-AI — ערוך לפי הצורך ולחץ שמור';
    } catch (err) {
      status.textContent = `שגיאה: ${err.message}`;
    } finally {
      btn.disabled = false;
    }
  }

  function _hideForm() {
    document.getElementById('qeForm').classList.add('hidden');
    document.getElementById('qeForm').innerHTML = '';
    _editingId   = null;
    _editingType = null;
  }

  async function _saveOpenQ() {
    const question = document.getElementById('qfOpenQ').value.trim();
    const answer   = document.getElementById('qfOpenA').value.trim();
    if (!question) { alert('יש להזין שאלה'); return; }

    try {
      if (_editingId) {
        await Api.updateOpenQuestion(_edPath, _editingId, question, answer);
      } else {
        await Api.addOpenQuestion(_edPath, question, answer);
      }
      await _loadEditorQuestions();
      _renderEditorTab();
      _hideForm();
    } catch (err) { alert(`שגיאה: ${err.message}`); }
  }

  async function _saveMcQ() {
    const question = document.getElementById('qfMcQ').value.trim();
    if (!question) { alert('יש להזין שאלה'); return; }

    const options = [0,1,2,3].map(i => (document.getElementById(`qfOpt${i}`)?.value || '').trim()).filter(Boolean);
    if (options.length < 2) { alert('יש להזין לפחות 2 אפשרויות'); return; }

    const correctRaw = document.querySelector('input[name="qfCorrect"]:checked')?.value;
    const correct    = correctRaw != null ? parseInt(correctRaw, 10) : 0;
    const corrAdj    = Math.min(correct, options.length - 1);

    try {
      if (_editingId) {
        await Api.updateMcQuestion(_edPath, _editingId, question, options, corrAdj);
      } else {
        await Api.addMcQuestion(_edPath, question, options, corrAdj);
      }
      await _loadEditorQuestions();
      _renderEditorTab();
      _hideForm();
    } catch (err) { alert(`שגיאה: ${err.message}`); }
  }

  async function _deleteQ(type, id) {
    const q = _edData[type].find(q => q.id === id);
    if (!q) return;
    const ok = await WindowManager.confirm(`למחוק את השאלה "${q.question.slice(0,60)}"?`);
    if (!ok) return;
    try {
      if (type === 'open') await Api.deleteOpenQuestion(_edPath, id);
      else                 await Api.deleteMcQuestion(_edPath, id);
      await _loadEditorQuestions();
      _renderEditorTab();
      _hideForm();
    } catch (err) { alert(`שגיאה: ${err.message}`); }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  QUIZ / TEST SCREEN
  // ═══════════════════════════════════════════════════════════════════════════

  async function startQuiz(paths, title) {
    _quizTitle = title;
    // Capture the current view before navigating to quiz
    const activeView = document.querySelector('.view.active');
    _previousView = activeView?.id?.replace('view-', '') || 'dashboard';

    let bundle;
    try {
      bundle = await Api.getQuizBundle(paths);
    } catch (err) {
      alert(`שגיאה בטעינת שאלות: ${err.message}`);
      return;
    }
    if (!bundle.length) {
      alert('אין שאלות זמינות לסיכומים אלו.\nהוסף שאלות תחילה דרך כפתור 📝 בעץ הסיכומים.');
      return;
    }

    _quizQs  = bundle;
    _answers = bundle.map(q => ({
      id: q.id, qtype: q.qtype, summaryPath: q.summaryPath,
      score: null, answered: false,
      selectedOption: null, selfAssess: null,
      userText: '',
      aiGraded: false,
      aiScore: null,
      aiCritique: '',
    }));
    _curIdx   = 0;
    _revealed = new Set();

    WindowManager.showView('quiz');
    _showQuizConfig();
  }

  function _showQuizConfig() {
    document.getElementById('quizFullTitle').textContent = `בחינה: ${_quizTitle}`;
    document.getElementById('quizConfig').classList.remove('hidden');
    document.getElementById('quizTestArea').classList.add('hidden');
    document.getElementById('quizResults').classList.add('hidden');

    const total = _quizQs.length;
    const opens = _quizQs.filter(q => q.qtype === 'open').length;
    const mcs   = total - opens;
    document.getElementById('quizConfigTitle').textContent = `הגדרות בחינה`;
    document.getElementById('quizConfigInfo').innerHTML =
      `<strong>${total}</strong> שאלות: ${mcs} בחירה מרובה + ${opens} פתוחות`;

    const aiGradeEl = document.getElementById('quizAiGrade');
    const strictRow = document.getElementById('quizStrictnessRow');
    if (aiGradeEl && strictRow) {
      aiGradeEl.onchange = () => {
        strictRow.style.display = aiGradeEl.checked ? '' : 'none';
      };
    }

    document.getElementById('quizStartBtn').onclick  = _startTest;
    document.getElementById('quizCancelBtn').onclick = _closeQuiz;
    document.getElementById('quizBackBtn').onclick   = _closeQuiz;
  }

  function _startTest() {
    const aiGradeEl  = document.getElementById('quizAiGrade');
    const strictEl   = document.getElementById('quizStrictness');
    const quotaVal   = document.getElementById('quizQuotaSelect')?.value || 'all';
    _config = {
      layout:    document.querySelector('input[name="quizLayout"]:checked')?.value   || 'one',
      feedback:  document.querySelector('input[name="quizFeedback"]:checked')?.value || 'instant',
      aiGrade:   aiGradeEl?.checked || false,
      strictness: strictEl?.value || 'בינונית',
    };

    // Shuffle all questions (Fisher-Yates), then apply quota slice
    let shuffled = _shuffle(_quizQs);
    if (quotaVal !== 'all') {
      const limit = parseInt(quotaVal, 10);
      if (!isNaN(limit) && limit > 0) shuffled = shuffled.slice(0, limit);
    }

    // Shuffle MC option order per question (keeps correct answer tracking intact)
    _quizQs = shuffled.map(q => {
      if (q.qtype !== 'mc' || !Array.isArray(q.options)) return q;
      const indexed = q.options.map((opt, i) => ({ opt, correct: i === q.correct_option_index }));
      const shuffledOpts = _shuffle(indexed);
      return {
        ...q,
        options: shuffledOpts.map(x => x.opt),
        correct_option_index: shuffledOpts.findIndex(x => x.correct),
      };
    });

    _answers = _quizQs.map(q => ({
      id: q.id, qtype: q.qtype, summaryPath: q.summaryPath,
      score: null, answered: false,
      selectedOption: null, selfAssess: null,
      userText: '',
      aiGraded: false, aiScore: null, aiCritique: '',
    }));

    _curIdx   = 0;
    _revealed = new Set();

    document.getElementById('quizConfig').classList.add('hidden');
    document.getElementById('quizTestArea').classList.remove('hidden');

    if (_config.layout === 'all') {
      _renderAllQuestions();
    } else {
      _renderOneQuestion();
    }
  }

  // ─── One-at-a-time mode ──────────────────────────────────────────────────

  function _renderOneQuestion() {
    _captureOpenAnswers(); // save any typed text before rebuilding

    const total   = _quizQs.length;
    const pct     = Math.round((_curIdx / total) * 100);
    document.getElementById('quizProgressFill').style.width  = pct + '%';
    document.getElementById('quizProgressLabel').textContent = `שאלה ${_curIdx + 1} מתוך ${total}`;

    const qc = document.getElementById('quizQuestionContainer');
    qc.innerHTML = _buildQuestionCard(_curIdx);
    _attachCardEvents(_curIdx, qc);

    const prevBtn    = document.getElementById('quizPrevBtn');
    const nextBtn    = document.getElementById('quizNextBtn');
    const finishBtn  = document.getElementById('quizFinishBtn');
    const isLast     = _curIdx === total - 1;

    prevBtn.classList.toggle('hidden', _curIdx === 0);
    nextBtn.classList.toggle('hidden', isLast);
    finishBtn.classList.toggle('hidden', !isLast);

    prevBtn.onclick   = () => { _captureOpenAnswers(); _curIdx--; _renderOneQuestion(); };
    nextBtn.onclick   = () => { _captureOpenAnswers(); _curIdx++; _renderOneQuestion(); };
    finishBtn.onclick = () => { _captureOpenAnswers(); _finishQuiz(); };
  }

  // ─── All-at-once mode ────────────────────────────────────────────────────

  function _renderAllQuestions() {
    const qc = document.getElementById('quizQuestionContainer');
    const pct = _quizQs.length > 0 ? Math.round((_answers.filter(a => a.answered).length / _quizQs.length) * 100) : 0;
    document.getElementById('quizProgressFill').style.width  = pct + '%';
    document.getElementById('quizProgressLabel').textContent = `${_answers.filter(a => a.answered).length} מתוך ${_quizQs.length} נענו`;

    qc.innerHTML = _quizQs.map((_, i) => _buildQuestionCard(i)).join('');
    _quizQs.forEach((_, i) => _attachCardEvents(i, qc));

    document.getElementById('quizPrevBtn').classList.add('hidden');
    document.getElementById('quizNextBtn').classList.add('hidden');
    document.getElementById('quizFinishBtn').classList.remove('hidden');
    document.getElementById('quizFinishBtn').onclick = () => { _captureOpenAnswers(); _finishQuiz(); };
  }

  // ─── Card builder ────────────────────────────────────────────────────────

  function _buildQuestionCard(idx) {
    const q   = _quizQs[idx];
    const ans = _answers[idx];
    const typeLabel = q.qtype === 'mc' ? 'בחירה מרובה' : 'שאלה פתוחה';
    const srcLabel  = q.summaryTitle ? `<span class="quiz-q-src">${_esc(q.summaryTitle)}</span>` : '';

    if (q.qtype === 'mc') {
      return _buildMcCard(idx, q, ans, typeLabel, srcLabel);
    } else {
      return _buildOpenCard(idx, q, ans, typeLabel, srcLabel);
    }
  }

  function _buildMcCard(idx, q, ans, typeLabel, srcLabel) {
    const feedbackShown = ans.answered && _config.feedback === 'instant';
    const opts = (q.options || []).map((opt, oi) => {
      let cls = 'quiz-option';
      if (ans.selectedOption === oi) cls += ' quiz-option--selected';
      if (feedbackShown) {
        if (oi === q.correct_option_index) cls += ' quiz-option--correct';
        else if (ans.selectedOption === oi) cls += ' quiz-option--wrong';
      }
      const letter = ['א', 'ב', 'ג', 'ד'][oi] || (oi + 1);
      return `<button class="quiz-option ${cls}" data-idx="${idx}" data-opt="${oi}" ${ans.answered ? 'disabled' : ''}>${letter}. ${_esc(opt)}</button>`;
    }).join('');

    const fb = feedbackShown
      ? `<div class="quiz-feedback ${ans.score === 1 ? 'quiz-feedback--correct' : 'quiz-feedback--wrong'}">
           ${ans.score === 1 ? '✓ תשובה נכונה!' : `✗ לא נכון — התשובה הנכונה: <strong>${_esc(q.options[q.correct_option_index])}</strong>`}
         </div>`
      : '';

    return `<div class="quiz-card" data-idx="${idx}">
      <div class="quiz-card__header"><span class="quiz-type-badge">${typeLabel}</span>${srcLabel}</div>
      <p class="quiz-card__question">${_esc(q.question)}</p>
      <div class="quiz-options">${opts}</div>
      ${fb}
    </div>`;
  }

  function _buildOpenCard(idx, q, ans, typeLabel, srcLabel) {
    const revealed = _revealed.has(idx);
    const scored   = ans.selfAssess != null || ans.aiGraded;

    if (_config.aiGrade) {
      // ── AI grading mode ──────────────────────────────────────────────────
      if (ans.aiGraded) {
        // Show AI evaluation result
        const scoreClass = ans.aiScore >= 80 ? 'quiz-ai-score--good' : ans.aiScore >= 50 ? 'quiz-ai-score--ok' : 'quiz-ai-score--bad';
        return `<div class="quiz-card" data-idx="${idx}">
          <div class="quiz-card__header"><span class="quiz-type-badge quiz-type-badge--open">${typeLabel}</span>${srcLabel}</div>
          <p class="quiz-card__question">${_esc(q.question)}</p>
          <div class="quiz-user-answer-display">
            <div class="quiz-user-answer-label">תשובתך:</div>
            <div class="quiz-user-answer-text">${_esc(ans.userText || '(לא הוזנה תשובה)')}</div>
          </div>
          <div class="quiz-ai-feedback">
            <div class="quiz-ai-score ${scoreClass}">${ans.aiScore}/100</div>
            <div class="quiz-ai-critique">${_esc(ans.aiCritique)}</div>
          </div>
          <div class="quiz-answer-block">
            <div class="quiz-answer-label">תשובה נכונה / הנחיות:</div>
            <div class="quiz-answer-text">${_esc(q.answer || '(לא הוגדרה תשובה)')}</div>
          </div>
        </div>`;
      }
      // Waiting for submission
      return `<div class="quiz-card" data-idx="${idx}">
        <div class="quiz-card__header"><span class="quiz-type-badge quiz-type-badge--open">${typeLabel}</span>${srcLabel}</div>
        <p class="quiz-card__question">${_esc(q.question)}</p>
        <div class="form-group" style="margin-top:0.5rem">
          <label class="form-label">תשובתך:</label>
          <textarea class="input-field input-field--full quiz-open-textarea" rows="4"
            placeholder="כתוב את תשובתך כאן..." data-idx="${idx}"
            dir="rtl">${_esc(ans.userText || '')}</textarea>
        </div>
        <div class="quiz-ai-submit-row">
          <button class="btn btn--primary btn--sm quiz-ai-submit-btn" data-idx="${idx}">הגש תשובה ⚡</button>
          <span class="quiz-ai-submit-hint hint">ה-AI יבדוק ויציין את תשובתך</span>
        </div>
        <div id="quizAiLoading_${idx}" class="quiz-ai-loading hidden">⏳ ה-AI בודק את תשובתך...</div>
      </div>`;
    }

    // ── Manual grading mode ───────────────────────────────────────────────
    const answerBlock = revealed ? `
      <div class="quiz-answer-block">
        <div class="quiz-answer-label">תשובה נכונה / הנחיות:</div>
        <div class="quiz-answer-text">${_esc(q.answer || '(לא הוגדרה תשובה)')}</div>
        ${!scored ? `
        <div class="quiz-self-assess">
          <span class="quiz-self-label">כיצד הסתדרת?</span>
          <button class="btn btn--success btn--sm quiz-assess-btn" data-idx="${idx}" data-score="1">ידעתי מצוין ★</button>
          <button class="btn btn--secondary btn--sm quiz-assess-btn" data-idx="${idx}" data-score="0.5">ידעתי חלקית</button>
          <button class="btn btn--danger btn--sm quiz-assess-btn" data-idx="${idx}" data-score="0">לא ידעתי</button>
        </div>` : `
        <div class="quiz-self-result ${_selfResultClass(ans.selfAssess)}">
          ${_selfResultLabel(ans.selfAssess)}
        </div>`}
      </div>` : '';

    return `<div class="quiz-card" data-idx="${idx}">
      <div class="quiz-card__header"><span class="quiz-type-badge quiz-type-badge--open">${typeLabel}</span>${srcLabel}</div>
      <p class="quiz-card__question">${_esc(q.question)}</p>
      <textarea class="input-field input-field--full quiz-open-textarea" rows="3"
        placeholder="כתוב את תשובתך כאן (אופציונלי)..." data-idx="${idx}"
        dir="rtl"
        ${scored ? 'disabled' : ''}>${_esc(ans.userText || '')}</textarea>
      ${!revealed ? `<button class="btn btn--secondary btn--sm quiz-reveal-btn" data-idx="${idx}">הצג תשובה נכונה 👁</button>` : ''}
      ${answerBlock}
    </div>`;
  }

  function _selfResultClass(assess) {
    return { 1: 'quiz-self-result--good', 0.5: 'quiz-self-result--partial', 0: 'quiz-self-result--bad' }[assess] || '';
  }
  function _selfResultLabel(assess) {
    return { 1: '★ ידעתי מצוין', 0.5: '◑ ידעתי חלקית', 0: '✗ לא ידעתי' }[assess] || '';
  }

  // ─── Event attachment ────────────────────────────────────────────────────

  function _attachCardEvents(idx, container) {
    // MC option clicks
    container.querySelectorAll(`.quiz-option[data-idx="${idx}"]`).forEach(btn => {
      btn.onclick = () => _recordMcAnswer(idx, parseInt(btn.dataset.opt, 10));
    });

    // Open: live save to state
    const textarea = container.querySelector(`.quiz-open-textarea[data-idx="${idx}"]`);
    if (textarea) {
      textarea.addEventListener('input', () => {
        if (_answers[idx]) _answers[idx].userText = textarea.value;
      });
    }

    // Open: AI submit button
    const aiSubmitBtn = container.querySelector(`.quiz-ai-submit-btn[data-idx="${idx}"]`);
    if (aiSubmitBtn) {
      aiSubmitBtn.onclick = () => _submitAiAnswer(idx);
    }

    // Open: reveal button (manual mode)
    const revealBtn = container.querySelector(`.quiz-reveal-btn[data-idx="${idx}"]`);
    if (revealBtn) revealBtn.onclick = () => _revealAnswer(idx);

    // Open: self-assess buttons (manual mode)
    container.querySelectorAll(`.quiz-assess-btn[data-idx="${idx}"]`).forEach(btn => {
      btn.onclick = () => _recordOpenScore(idx, parseFloat(btn.dataset.score));
    });
  }

  function _recordMcAnswer(idx, selectedOpt) {
    const q   = _quizQs[idx];
    const ans = _answers[idx];
    if (ans.answered) return;
    ans.selectedOption = selectedOpt;
    ans.answered       = true;
    ans.score          = selectedOpt === q.correct_option_index ? 1 : 0;

    if (_config.layout === 'one') {
      _renderOneQuestion();
    } else {
      const container = document.getElementById('quizQuestionContainer');
      const old = container.querySelector(`.quiz-card[data-idx="${idx}"]`);
      if (old) {
        old.outerHTML = _buildMcCard(idx, q, ans,
          'בחירה מרובה',
          q.summaryTitle ? `<span class="quiz-q-src">${_esc(q.summaryTitle)}</span>` : '');
        _attachCardEvents(idx, container);
      }
      _updateAllProgress();
    }
  }

  async function _submitAiAnswer(idx) {
    _captureOpenAnswers();
    const q   = _quizQs[idx];
    const ans = _answers[idx];
    const userText = ans.userText || '';

    const btn     = document.querySelector(`.quiz-ai-submit-btn[data-idx="${idx}"]`);
    const loading = document.getElementById(`quizAiLoading_${idx}`);

    if (btn) btn.disabled = true;
    if (loading) loading.classList.remove('hidden');

    try {
      const result = await Api.aiGradeAnswer(
        q.question,
        q.answer || '',
        userText,
        _config.strictness
      );
      ans.aiScore    = result.score;
      ans.aiCritique = result.critique || '';
      ans.aiGraded   = true;
      ans.answered   = true;
      // Normalize to 0-1 scale
      ans.score      = result.score / 100;
    } catch (err) {
      if (loading) loading.classList.add('hidden');
      if (btn) btn.disabled = false;
      alert(`שגיאה בבדיקת ה-AI: ${err.message}`);
      return;
    }

    if (_config.layout === 'one') {
      _renderOneQuestion();
    } else {
      const container = document.getElementById('quizQuestionContainer');
      const old = container.querySelector(`.quiz-card[data-idx="${idx}"]`);
      if (old) {
        old.outerHTML = _buildOpenCard(idx, q, ans,
          'שאלה פתוחה',
          q.summaryTitle ? `<span class="quiz-q-src">${_esc(q.summaryTitle)}</span>` : '');
        _attachCardEvents(idx, container);
      }
      _updateAllProgress();
    }
  }

  function _revealAnswer(idx) {
    _captureOpenAnswers();
    _revealed.add(idx);
    const q   = _quizQs[idx];
    const ans = _answers[idx];
    if (_config.layout === 'one') {
      _renderOneQuestion();
    } else {
      const container = document.getElementById('quizQuestionContainer');
      const old = container.querySelector(`.quiz-card[data-idx="${idx}"]`);
      if (old) {
        old.outerHTML = _buildOpenCard(idx, q, ans,
          'שאלה פתוחה',
          q.summaryTitle ? `<span class="quiz-q-src">${_esc(q.summaryTitle)}</span>` : '');
        _attachCardEvents(idx, container);
      }
    }
  }

  function _recordOpenScore(idx, score) {
    const ans      = _answers[idx];
    ans.score      = score;
    ans.selfAssess = score;
    ans.answered   = true;

    if (_config.layout === 'one') {
      _renderOneQuestion();
    } else {
      const q   = _quizQs[idx];
      const container = document.getElementById('quizQuestionContainer');
      const old = container.querySelector(`.quiz-card[data-idx="${idx}"]`);
      if (old) {
        old.outerHTML = _buildOpenCard(idx, q, ans,
          'שאלה פתוחה',
          q.summaryTitle ? `<span class="quiz-q-src">${_esc(q.summaryTitle)}</span>` : '');
        _attachCardEvents(idx, container);
      }
      _updateAllProgress();
    }
  }

  function _updateAllProgress() {
    const done  = _answers.filter(a => a.answered).length;
    const total = _quizQs.length;
    const pct   = total > 0 ? Math.round((done / total) * 100) : 0;
    document.getElementById('quizProgressFill').style.width  = pct + '%';
    document.getElementById('quizProgressLabel').textContent = `${done} מתוך ${total} נענו`;
  }

  // ─── Results ─────────────────────────────────────────────────────────────

  async function _finishQuiz() {
    _captureOpenAnswers();
    document.getElementById('quizTestArea').classList.add('hidden');

    // ── Deferred bulk AI grading ──────────────────────────────────────────
    // If AI mode is on, grade every ungraded open question that has a user answer
    const pendingGrades = _config.aiGrade
      ? _answers.map((ans, i) => ({ ans, i, q: _quizQs[i] }))
          .filter(({ ans, q }) => q.qtype === 'open' && !ans.aiGraded && ans.userText?.trim())
      : [];

    if (pendingGrades.length > 0) {
      const scoreEl = document.getElementById('quizScoreDisplay');
      scoreEl.innerHTML = `<p class="hint" style="text-align:center;padding:1rem">
        ⏳ ה-AI מדרג ${pendingGrades.length} תשובות — אנא המתן...</p>`;
      document.getElementById('quizResults').classList.remove('hidden');

      await Promise.all(pendingGrades.map(async ({ ans, i, q }) => {
        try {
          const result = await Api.aiGradeAnswer(q.question, q.answer || '', ans.userText, _config.strictness);
          ans.aiScore    = result.score;
          ans.aiCritique = result.critique || '';
          ans.aiGraded   = true;
          ans.answered   = true;
          ans.score      = result.score / 100;
        } catch {
          ans.aiScore    = 0;
          ans.aiCritique = 'שגיאה בבדיקת ה-AI';
          ans.aiGraded   = true;
          ans.answered   = true;
          ans.score      = 0;
        }
      }));
    } else {
      document.getElementById('quizResults').classList.remove('hidden');
    }

    // For end-feedback MC: compute scores now
    _answers.forEach((ans, idx) => {
      const q = _quizQs[idx];
      if (q.qtype === 'mc' && ans.answered && ans.score == null) {
        ans.score = ans.selectedOption === q.correct_option_index ? 1 : 0;
      }
    });

    const answered = _answers.filter(a => a.answered);
    const total    = _quizQs.length;
    const sumScore = answered.reduce((s, a) => s + (a.score ?? 0), 0);
    const finalPct = total > 0 ? Math.round((sumScore / total) * 100) : 0;

    // Score display
    const scoreEl2 = document.getElementById('quizScoreDisplay');
    const scoreClass = finalPct >= 80 ? 'score--great' : finalPct >= 60 ? 'score--ok' : 'score--poor';
    scoreEl2.innerHTML = `
      <div class="quiz-score-circle ${scoreClass}">${finalPct}%</div>
      <div class="quiz-score-stats">
        <p>ענית על <strong>${answered.length}</strong> מתוך <strong>${total}</strong> שאלות</p>
        <p>ניקוד: <strong>${sumScore.toFixed(1)}</strong> מתוך ${total}</p>
        ${_config.aiGrade ? '<p class="hint">הניקוד מבוסס על הערכת ה-AI</p>' : ''}
        ${finalPct < 70 ? '<p class="quiz-sr-note">⚠ ציון נמוך — מועד החזרה הבא קוצר אוטומטית</p>' : ''}
      </div>`;

    // Per-question breakdown — comprehensive view
    const listEl = document.getElementById('quizResultsList');
    listEl.innerHTML = `<h4 class="quiz-results-heading">פירוט תשובות</h4>` +
      _quizQs.map((q, i) => {
        const ans = _answers[i];
        let icon, detail = '', extraHtml = '';

        if (!ans.answered) {
          icon   = '<span class="res-icon res-icon--skip">—</span>';
          detail = 'לא נענתה';
        } else if (q.qtype === 'mc') {
          const ok = ans.score === 1;
          icon   = ok ? '<span class="res-icon res-icon--ok">✓</span>' : '<span class="res-icon res-icon--bad">✗</span>';
          detail = ok ? 'נכון' : `לא נכון — נכון: ${_esc(q.options?.[q.correct_option_index] ?? '')}`;
        } else if (ans.aiGraded) {
          const sc  = ans.aiScore ?? 0;
          const cls = sc >= 80 ? 'res-icon--ok' : sc >= 50 ? 'res-icon--partial' : 'res-icon--bad';
          icon  = `<span class="res-icon ${cls}">${sc}/100</span>`;
          // Full open-question breakdown: question + sample answer + user answer + critique + appeal
          extraHtml = `
            <div class="quiz-result-open-block">
              <div class="quiz-result-open-row"><strong>שאלה:</strong> ${_esc(q.question)}</div>
              <div class="quiz-result-open-row quiz-result-open-row--sample"><strong>תשובה מצופה:</strong> ${_esc(q.answer || '(לא הוגדרה)')}</div>
              <div class="quiz-result-open-row quiz-result-open-row--user"><strong>תשובתך:</strong> ${_esc(ans.userText || '(לא הוזנה)')}</div>
              <div class="quiz-result-open-row quiz-result-open-row--critique"><strong>הערת ה-AI:</strong> ${_esc(ans.aiCritique)}</div>
              <div class="quiz-appeal-wrap" id="appeal_wrap_${i}">
                <span class="quiz-appeal-score-log" id="appeal_log_${i}"></span>
                <button class="btn btn--xs btn--ghost quiz-appeal-btn" data-qi="${i}">ערער על הציון</button>
              </div>
            </div>`;
        } else {
          icon   = `<span class="res-icon">${_selfResultLabel(ans.selfAssess)}</span>`;
          if (q.qtype === 'open' && ans.userText) {
            extraHtml = `<div class="quiz-result-open-block">
              <div class="quiz-result-open-row quiz-result-open-row--user"><strong>תשובתך:</strong> ${_esc(ans.userText)}</div>
              <div class="quiz-result-open-row quiz-result-open-row--sample"><strong>תשובה מצופה:</strong> ${_esc(q.answer || '(לא הוגדרה)')}</div>
            </div>`;
          }
        }

        return `<div class="quiz-result-row ${q.qtype === 'open' ? 'quiz-result-row--open' : ''}">
          <div class="quiz-result-top">
            ${icon}
            <span class="quiz-result-q">${_esc(q.question.slice(0, 80))}${q.question.length > 80 ? '…' : ''}</span>
          </div>
          ${extraHtml}
          ${detail ? `<div class="quiz-result-d">${detail}</div>` : ''}
        </div>`;
      }).join('');

    // Bind appeal buttons
    listEl.querySelectorAll('.quiz-appeal-btn').forEach(btn => {
      btn.addEventListener('click', () => _openAppeal(parseInt(btn.dataset.qi, 10)));
    });

    document.getElementById('quizCloseResultsBtn').onclick = _closeQuiz;
    document.getElementById('quizBackBtn').onclick = _closeQuiz;

    // Submit to backend
    try {
      await Api.submitQuizResult(
        null,
        finalPct / 100,
        _answers.map((a) => ({ id: a.id, qtype: a.qtype, summaryPath: a.summaryPath, score: a.score ?? 0 }))
      );
    } catch (err) {
      console.error('שגיאה בשמירת תוצאות:', err.message);
    }
  }

  // ─── Appeal system ────────────────────────────────────────────────────────

  function _openAppeal(qi) {
    const wrapEl = document.getElementById(`appeal_wrap_${qi}`);
    if (!wrapEl) return;
    // Only show textarea if not already open
    if (wrapEl.querySelector('.quiz-appeal-textarea')) return;
    const ans = _answers[qi];
    const q   = _quizQs[qi];
    wrapEl.insertAdjacentHTML('beforeend', `
      <div class="quiz-appeal-form">
        <textarea class="quiz-appeal-textarea input-field" dir="rtl" rows="3"
          placeholder="הסבר מדוע תשובתך נכונה או ראויה לציון גבוה יותר..."></textarea>
        <button class="btn btn--xs btn--primary quiz-appeal-submit-btn" data-qi="${qi}">שלח ערעור</button>
        <span class="quiz-appeal-loading hidden" id="appeal_loading_${qi}">⏳ שולח ערעור...</span>
      </div>`);
    wrapEl.querySelector('.quiz-appeal-submit-btn').addEventListener('click', async () => {
      const argument = wrapEl.querySelector('.quiz-appeal-textarea')?.value?.trim();
      if (!argument) { alert('יש להזין נימוק לערעור'); return; }
      const submitBtn  = wrapEl.querySelector('.quiz-appeal-submit-btn');
      const loadingEl  = document.getElementById(`appeal_loading_${qi}`);
      submitBtn.disabled = true;
      loadingEl?.classList.remove('hidden');
      try {
        const result = await Api.aiAppealGrade({
          question:       q.question,
          sampleAnswer:   q.answer || '',
          userAnswer:     ans.userText || '',
          originalCritique: ans.aiCritique || '',
          originalScore:  ans.aiScore ?? 0,
          appealArgument: argument,
        });
        const prevScore = ans.aiScore ?? 0;
        ans.aiScore    = result.newScore;
        ans.aiCritique = result.newCritique;
        ans.score      = result.newScore / 100;
        const logEl = document.getElementById(`appeal_log_${qi}`);
        if (logEl) {
          logEl.textContent = `ציון מקורי: ${prevScore}/100 ← ציון לאחר ערעור: ${result.newScore}/100`;
          logEl.className = 'quiz-appeal-score-log quiz-appeal-score-log--updated';
        }
        const iconEl = wrapEl.closest('.quiz-result-row')?.querySelector('.res-icon');
        if (iconEl) {
          const sc = result.newScore;
          iconEl.className = `res-icon ${sc >= 80 ? 'res-icon--ok' : sc >= 50 ? 'res-icon--partial' : 'res-icon--bad'}`;
          iconEl.textContent = `${sc}/100`;
        }
        const critiqueEl = wrapEl.previousElementSibling?.querySelector?.('.quiz-result-open-row--critique');
        if (critiqueEl) critiqueEl.innerHTML = `<strong>הערת ה-AI (לאחר ערעור):</strong> ${_esc(result.newCritique)}`;
        wrapEl.querySelector('.quiz-appeal-form')?.remove();
        wrapEl.querySelector('.quiz-appeal-btn')?.remove();
      } catch (err) {
        alert(`שגיאה בערעור: ${err.message}`);
        submitBtn.disabled = false;
      } finally {
        loadingEl?.classList.add('hidden');
      }
    });
  }

  function _closeQuiz() {
    WindowManager.showView(_previousView || 'dashboard');
  }

  // ─── Public ───────────────────────────────────────────────────────────────

  return { openEditor, openEditorDocked, startQuiz };
})();
