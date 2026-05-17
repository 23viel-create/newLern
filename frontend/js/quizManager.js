// מנהל השאלות, עורך השאלות, ומסך הבחינה
const QuizManager = (() => {

  // ─── Editor state ─────────────────────────────────────────────────────────
  let _edPath  = null;
  let _edTitle = null;
  let _edData  = { open: [], mc: [] };
  let _edTab   = 'open';
  let _editingId   = null;  // question id being edited, or null for new
  let _editingType = null;  // 'open' | 'mc'

  // ─── Quiz state ───────────────────────────────────────────────────────────
  let _quizQs      = [];    // shuffled bundle from server
  let _answers     = [];    // per-question answer tracking
  let _config      = { layout: 'one', feedback: 'instant' };
  let _curIdx      = 0;
  let _quizTitle   = '';
  let _revealed    = new Set();  // indices whose open answer has been shown

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _pct(v) { return v == null ? '—' : Math.round(v * 100) + '%'; }

  // ═══════════════════════════════════════════════════════════════════════════
  //  QUESTION EDITOR
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
          <button id="qfCancelBtn" class="btn btn--secondary">ביטול</button>
        </div>`;
      document.getElementById('qfSaveBtn').onclick   = _saveOpenQ;
      document.getElementById('qfCancelBtn').onclick = _hideForm;
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
          <button id="qfCancelBtn" class="btn btn--secondary">ביטול</button>
        </div>`;
      document.getElementById('qfSaveBtn').onclick   = _saveMcQ;
      document.getElementById('qfCancelBtn').onclick = _hideForm;
      document.getElementById('qfMcQ').focus();
    }

    formEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
    }));
    _curIdx   = 0;
    _revealed = new Set();

    _showQuizConfig();
  }

  function _showQuizConfig() {
    const modal = document.getElementById('quizModal');
    modal.classList.remove('hidden');
    document.getElementById('quizConfig').classList.remove('hidden');
    document.getElementById('quizTestArea').classList.add('hidden');
    document.getElementById('quizResults').classList.add('hidden');

    const total = _quizQs.length;
    const opens = _quizQs.filter(q => q.qtype === 'open').length;
    const mcs   = total - opens;
    document.getElementById('quizConfigTitle').textContent = `בחינה: ${_quizTitle}`;
    document.getElementById('quizConfigInfo').innerHTML =
      `<strong>${total}</strong> שאלות: ${mcs} בחירה מרובה + ${opens} פתוחות`;

    document.getElementById('quizStartBtn').onclick = _startTest;
    document.getElementById('quizCancelBtn').onclick = _closeQuiz;
    modal.querySelector('.modal__overlay').onclick = _closeQuiz;
  }

  function _startTest() {
    _config = {
      layout:   document.querySelector('input[name="quizLayout"]:checked')?.value   || 'one',
      feedback: document.querySelector('input[name="quizFeedback"]:checked')?.value || 'instant',
    };
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

    prevBtn.onclick   = () => { _curIdx--; _renderOneQuestion(); };
    nextBtn.onclick   = () => { _curIdx++; _renderOneQuestion(); };
    finishBtn.onclick = _finishQuiz;
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
    document.getElementById('quizFinishBtn').onclick = _finishQuiz;
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
    const revealed  = _revealed.has(idx);
    const scored    = ans.selfAssess != null;

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
        ${scored ? 'disabled' : ''}></textarea>
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

    // Open: reveal button
    const revealBtn = container.querySelector(`.quiz-reveal-btn[data-idx="${idx}"]`);
    if (revealBtn) revealBtn.onclick = () => _revealAnswer(idx);

    // Open: self-assess buttons
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
      // Refresh just this card
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

  function _revealAnswer(idx) {
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
    const ans        = _answers[idx];
    ans.score        = score;
    ans.selfAssess   = score;
    ans.answered     = true;

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
    const done = _answers.filter(a => a.answered).length;
    const total = _quizQs.length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    document.getElementById('quizProgressFill').style.width  = pct + '%';
    document.getElementById('quizProgressLabel').textContent = `${done} מתוך ${total} נענו`;
  }

  // ─── Results ─────────────────────────────────────────────────────────────

  async function _finishQuiz() {
    document.getElementById('quizTestArea').classList.add('hidden');
    document.getElementById('quizResults').classList.remove('hidden');

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
    const scoreEl = document.getElementById('quizScoreDisplay');
    const scoreClass = finalPct >= 80 ? 'score--great' : finalPct >= 60 ? 'score--ok' : 'score--poor';
    scoreEl.innerHTML = `
      <div class="quiz-score-circle ${scoreClass}">${finalPct}%</div>
      <div class="quiz-score-stats">
        <p>ענית על <strong>${answered.length}</strong> מתוך <strong>${total}</strong> שאלות</p>
        <p>ניקוד: <strong>${sumScore.toFixed(1)}</strong> מתוך ${total}</p>
        ${finalPct < 70 ? '<p class="quiz-sr-note">⚠ ציון נמוך — מועד החזרה הבא קוצר אוטומטית</p>' : ''}
      </div>`;

    // Per-question breakdown
    const listEl = document.getElementById('quizResultsList');
    listEl.innerHTML = `<h4 class="quiz-results-heading">פירוט תשובות</h4>` +
      _quizQs.map((q, i) => {
        const ans = _answers[i];
        let icon, detail;
        if (!ans.answered) {
          icon   = '<span class="res-icon res-icon--skip">—</span>';
          detail = 'לא נענתה';
        } else if (q.qtype === 'mc') {
          const ok = ans.score === 1;
          icon   = ok ? '<span class="res-icon res-icon--ok">✓</span>' : '<span class="res-icon res-icon--bad">✗</span>';
          detail = ok ? 'נכון' : `לא נכון — נכון: ${_esc(q.options?.[q.correct_option_index] ?? '')}`;
        } else {
          icon   = `<span class="res-icon">${_selfResultLabel(ans.selfAssess)}</span>`;
          detail = '';
        }
        return `<div class="quiz-result-row">
          ${icon}
          <span class="quiz-result-q">${_esc(q.question.slice(0, 80))}${q.question.length > 80 ? '…' : ''}</span>
          <span class="quiz-result-d">${detail}</span>
        </div>`;
      }).join('');

    document.getElementById('quizCloseResultsBtn').onclick = _closeQuiz;

    // Submit to backend
    try {
      await Api.submitQuizResult(
        null,
        finalPct / 100,
        _answers.map((a, i) => ({
          id: a.id, qtype: a.qtype, summaryPath: a.summaryPath, score: a.score ?? 0
        }))
      );
    } catch (err) {
      console.error('שגיאה בשמירת תוצאות:', err.message);
    }
  }

  function _closeQuiz() {
    document.getElementById('quizModal').classList.add('hidden');
  }

  // ─── Public ───────────────────────────────────────────────────────────────

  return { openEditor, startQuiz };
})();
