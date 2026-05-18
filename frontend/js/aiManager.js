// ─── מנהל מסייע ה-AI ───────────────────────────────────────────────────────
const AiManager = (() => {
  let _offline = false;
  let _currentContext = 'editor'; // editor | quiz | calendar | articles

  // ─── DOM refs ───────────────────────────────────────────────────────────────
  const el = {
    panel:          () => document.getElementById('aiPanel'),
    offlineBadge:   () => document.getElementById('aiOfflineBadge'),
    offlineBanner:  () => document.getElementById('aiOfflineBanner'),
    contextActions: () => document.getElementById('aiContextActions'),
    chatMessages:   () => document.getElementById('aiChatMessages'),
    chatInput:      () => document.getElementById('aiChatInput'),
    sendBtn:        () => document.getElementById('aiSendBtn'),
    keyCount:       () => document.getElementById('keyCount'),
    keyBattery:     () => document.getElementById('keyBattery'),
    apiKeysList:    () => document.getElementById('apiKeysList'),
    saveKeysBtn:    () => document.getElementById('saveKeysBtn'),
    keysSavedMsg:   () => document.getElementById('keysSavedMsg'),
    articlesMsgs:   () => document.getElementById('articlesChatMessages'),
    articlesInput:  () => document.getElementById('articlesChatInput'),
    articlesSend:   () => document.getElementById('articlesChatSendBtn'),
    programBtn:     () => document.getElementById('learningProgramBtn'),
  };

  // ─── Offline state ──────────────────────────────────────────────────────────
  function setOffline(isOffline) {
    _offline = isOffline;
    const banner  = el.offlineBanner();
    const badge   = el.offlineBadge();
    const sendBtn = el.sendBtn();
    const input   = el.chatInput();
    if (!banner) return;

    if (isOffline) {
      banner.classList.remove('hidden');
      if (badge)   badge.classList.remove('hidden');
      if (sendBtn) sendBtn.disabled = true;
      if (input)   input.disabled   = true;
    } else {
      banner.classList.add('hidden');
      if (badge)   badge.classList.add('hidden');
      if (sendBtn) sendBtn.disabled = false;
      if (input)   input.disabled   = false;
    }
  }

  // ─── Context action buttons ─────────────────────────────────────────────────
  function _renderContextActions() {
    const container = el.contextActions();
    if (!container) return;
    container.innerHTML = '';

    const actions = _getActionsForContext(_currentContext);
    actions.forEach(({ label, handler }) => {
      const btn = document.createElement('button');
      btn.className = 'btn btn--ghost btn--sm ai-action-btn';
      btn.textContent = label;
      btn.disabled = _offline;
      btn.addEventListener('click', () => { if (!_offline) handler(); });
      container.appendChild(btn);
    });
  }

  function _getActionsForContext(ctx) {
    if (ctx === 'editor') {
      return [
        { label: '📖 הסבר את הסיכום', handler: _doExplain },
        { label: '🔍 מצא מקורות', handler: _doSources },
        { label: '💡 שאל על הסיכום', handler: _doPromptUser },
        { label: '📝 הצע שאלות', handler: _doSuggestQuestions },
      ];
    }
    if (ctx === 'quiz') {
      return [
        { label: '📝 הצע שאלות חדשות', handler: _doSuggestQuestions },
        { label: '✍️ צור תשובות לדוגמה', handler: _doSampleAnswers },
      ];
    }
    if (ctx === 'calendar') {
      return [
        { label: '📅 ייעוץ לפיזור עומס', handler: _doScheduleAdvice },
      ];
    }
    return [];
  }

  // ─── Action handlers ────────────────────────────────────────────────────────
  async function _doExplain() {
    const node = typeof EditorManager !== 'undefined' ? EditorManager.getCurrentNode() : null;
    const content = document.getElementById('editorContent')?.innerText?.slice(0, 3000) || '';
    await _sendToChat(
      'editor',
      'הסבר בקצרה את עיקרי הסיכום הזה ורשום 3 נקודות מפתח',
      { content, title: node?.title || node?.path || '' }
    );
  }

  async function _doSources() {
    const node = typeof EditorManager !== 'undefined' ? EditorManager.getCurrentNode() : null;
    const content = document.getElementById('editorContent')?.innerText?.slice(0, 3000) || '';
    await _sendToChat(
      'editor',
      'מצא מקורות מקראיים או אקדמיים רלוונטיים לסיכום זה',
      { content, title: node?.title || node?.path || '' }
    );
  }

  function _doPromptUser() {
    const input = el.chatInput();
    if (input) input.focus();
  }

  async function _doSuggestQuestions() {
    const node = typeof EditorManager !== 'undefined' ? EditorManager.getCurrentNode() : null;
    if (!node) { _appendMessage('system', 'פתח סיכום כדי להציע שאלות'); return; }
    _appendMessage('system', 'מציע שאלות חדשות...');
    try {
      const content = document.getElementById('editorContent')?.innerText?.slice(0, 3000) || '';
      const res = await Api.aiSuggestQuestions(content, node.title || node.path, [], 'open');
      const questions = Array.isArray(res.questions) ? res.questions : [];
      if (!questions.length) {
        _appendMessage('ai', typeof res.questions === 'string' ? res.questions : 'לא הצלחתי ליצור שאלות');
        return;
      }
      const text = questions.map((q, i) => `${i + 1}. ${q.question}`).join('\n');
      _appendMessage('ai', text);
    } catch (err) {
      _appendMessage('error', err.message);
    }
  }

  async function _doSampleAnswers() {
    const node = typeof EditorManager !== 'undefined' ? EditorManager.getCurrentNode() : null;
    const title = node?.title || node?.path || 'הנושא';
    await _sendToChat('quiz', `צור 3 תשובות לדוגמה לשאלות פתוחות על: ${title}`, { title });
  }

  async function _doScheduleAdvice() {
    _appendMessage('system', 'מנתח את לוח הזמנים...');
    try {
      const calData = await Api.getCalendarData(
        new Date().toISOString().slice(0, 7)
      );
      const heavyDays = (calData?.days || [])
        .filter(d => d.load === 'high')
        .map(d => d.date);
      const res = await Api.aiScheduleAdvice(heavyDays, calData?.totalTasks || 0);
      _appendMessage('ai', res.advice || 'אין המלצות');
    } catch (err) {
      _appendMessage('error', err.message);
    }
  }

  // ─── Markdown renderer (safe — escapes HTML before converting) ───────────────
  function _mdToHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  // ─── Chat ────────────────────────────────────────────────────────────────────
  async function _sendToChat(context, message, extra) {
    _appendMessage('user', message);
    _appendMessage('system', 'מחשב...');
    try {
      const node = typeof EditorManager !== 'undefined' ? EditorManager.getCurrentNode() : null;
      const fullExtra = {
        ...extra,
        title: extra?.title || node?.title || node?.path,
        content: extra?.content || document.getElementById('editorContent')?.innerText?.slice(0, 3000) || '',
      };
      const res = await Api.aiAsk(context, message, fullExtra);
      _removeLastSystemMessage();
      _appendMessage('ai', res.answer || 'אין תגובה');
    } catch (err) {
      _removeLastSystemMessage();
      _appendMessage('error', err.message);
    }
  }

  function _appendMessage(role, text) {
    const box = el.chatMessages();
    if (!box) return;
    const div = document.createElement('div');
    div.className = `ai-msg ai-msg--${role}`;
    if (role === 'ai') {
      div.innerHTML = _mdToHtml(text);
    } else {
      div.textContent = text;
    }
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }

  function _removeLastSystemMessage() {
    const box = el.chatMessages();
    if (!box) return;
    const last = box.querySelector('.ai-msg--system:last-child');
    if (last) last.remove();
  }

  // ─── Key management — dynamic unlimited list ─────────────────────────────────
  async function _renderKeyFields() {
    const container = el.apiKeysList();
    if (!container) return;

    let savedCount = 0;
    try {
      const res = await Api.aiGetKeys();
      savedCount = (res.keys || []).length;
    } catch { /* first load */ }

    container.innerHTML = '';
    const slotCount = Math.max(savedCount, 1);
    for (let i = 0; i < slotCount; i++) _addKeyRow(container, i);
    _appendAddKeyButton(container);
  }

  function _addKeyRow(container, index) {
    const row = document.createElement('div');
    row.className = 'form-group api-key-row';
    row.innerHTML = `
      <label class="form-label">מפתח ${index + 1}</label>
      <div class="api-key-input-wrap">
        <input type="password"
               class="input-field input-field--full api-key-input"
               placeholder="AIza..."
               autocomplete="off" />
        <button type="button" class="btn btn--ghost btn--xs remove-key-btn" title="הסר מפתח">✕</button>
      </div>`;
    row.querySelector('.remove-key-btn').addEventListener('click', () => {
      row.remove();
      _renumberKeys();
    });
    // Insert before the "add" button if it exists
    const addBtn = container.querySelector('.add-key-btn-wrap');
    if (addBtn) container.insertBefore(row, addBtn);
    else container.appendChild(row);
  }

  function _appendAddKeyButton(container) {
    const wrap = document.createElement('div');
    wrap.className = 'add-key-btn-wrap';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn--ghost btn--sm';
    btn.textContent = '+ הוסף מפתח';
    btn.addEventListener('click', () => {
      const rows = container.querySelectorAll('.api-key-row');
      _addKeyRow(container, rows.length);
      _renumberKeys();
    });
    wrap.appendChild(btn);
    container.appendChild(wrap);
  }

  function _renumberKeys() {
    const container = el.apiKeysList();
    if (!container) return;
    container.querySelectorAll('.api-key-row label').forEach((lbl, i) => {
      lbl.textContent = `מפתח ${i + 1}`;
    });
  }

  async function _saveKeys() {
    const inputs = document.querySelectorAll('.api-key-input');
    const keys = Array.from(inputs).map(inp => inp.value.trim()).filter(Boolean);
    try {
      await Api.aiSaveKeys(keys);
      const msg = el.keysSavedMsg();
      if (msg) { msg.classList.remove('hidden'); setTimeout(() => msg.classList.add('hidden'), 2500); }
      await _refreshBattery();
    } catch (err) {
      alert(`שגיאה בשמירת מפתחות: ${err.message}`);
    }
  }

  async function _refreshBattery() {
    try {
      const status = await Api.aiKeyStatus();
      const cnt = el.keyCount();
      if (cnt) cnt.textContent = Array.isArray(status) ? status.length : 0;

      const battery = el.keyBattery();
      if (!battery || !Array.isArray(status)) return;
      battery.innerHTML = status.map(k => `
        <div class="key-cell ${k.healthy ? 'key-cell--ok' : 'key-cell--err'}">
          <span class="key-cell__label">מפתח ${k.index}</span>
          <span class="key-cell__chars">${(k.charsUsed / 1000).toFixed(1)}k תווים</span>
          <span class="key-cell__status">${k.healthy ? '✓' : '✕'}</span>
        </div>
      `).join('');
    } catch { /* no keys yet */ }
  }

  // ─── Articles chat (settings panel) ─────────────────────────────────────────
  async function _sendArticlesChat() {
    const input = el.articlesInput();
    if (!input) return;
    const msg = input.value.trim();
    if (!msg) return;
    input.value = '';

    _appendArticlesMsg('user', msg);
    _appendArticlesMsg('system', 'מחפש במאמרים...');
    try {
      const res = await Api.aiArticlesChat(msg);
      _removeLastArticlesSystemMsg();
      _appendArticlesMsg('ai', res.answer || 'אין תגובה');
    } catch (err) {
      _removeLastArticlesSystemMsg();
      _appendArticlesMsg('error', err.message);
    }
  }

  function _appendArticlesMsg(role, text) {
    const box = el.articlesMsgs();
    if (!box) return;
    const div = document.createElement('div');
    div.className = `ai-msg ai-msg--${role}`;
    if (role === 'ai') {
      div.innerHTML = _mdToHtml(text);
    } else {
      div.textContent = text;
    }
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }

  function _removeLastArticlesSystemMsg() {
    const box = el.articlesMsgs();
    if (!box) return;
    const last = box.querySelector('.ai-msg--system:last-child');
    if (last) last.remove();
  }

  async function _generateLearningProgram() {
    const goals = prompt('מהן מטרות הלמידה שלך? (תאר בקצרה)');
    if (!goals) return;
    const daysPerWeek = parseInt(prompt('כמה ימי לימוד בשבוע?', '5'), 10) || 5;
    const hoursPerDay = parseFloat(prompt('כמה שעות ביום?', '1')) || 1;

    _appendArticlesMsg('system', 'בונה תוכנית לימוד אישית...');
    try {
      const res = await Api.aiLearningProgram(goals, daysPerWeek, hoursPerDay);
      _removeLastArticlesSystemMsg();
      _appendArticlesMsg('ai', res.program || 'לא ניתן ליצור תוכנית');
    } catch (err) {
      _removeLastArticlesSystemMsg();
      _appendArticlesMsg('error', err.message);
    }
  }

  // ─── Public API ──────────────────────────────────────────────────────────────
  function setContext(ctx) {
    _currentContext = ctx;
    _renderContextActions();
  }

  async function init() {
    // Bind send button
    el.sendBtn()?.addEventListener('click', async () => {
      const input = el.chatInput();
      if (!input || _offline) return;
      const msg = input.value.trim();
      if (!msg) return;
      input.value = '';
      const node = typeof EditorManager !== 'undefined' ? EditorManager.getCurrentNode() : null;
      const content = document.getElementById('editorContent')?.innerText?.slice(0, 3000) || '';
      await _sendToChat(_currentContext, msg, {
        title: node?.title || node?.path || '',
        content,
      });
    });

    // Ctrl+Enter shortcut
    el.chatInput()?.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') el.sendBtn()?.click();
    });

    // Settings keys
    el.saveKeysBtn()?.addEventListener('click', _saveKeys);
    el.articlesSend()?.addEventListener('click', _sendArticlesChat);
    el.articlesInput()?.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') _sendArticlesChat();
    });
    el.programBtn()?.addEventListener('click', _generateLearningProgram);

    await _renderKeyFields();
    await _refreshBattery();
    _renderContextActions();
  }

  return { init, setContext, setOffline, refreshBattery: _refreshBattery };
})();
