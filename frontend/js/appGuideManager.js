// ─── מדריך AI הקשרי-מסך ─────────────────────────────────────────────────────
const AppGuideManager = (() => {
  let _open = false;
  let _currentScreen = 'כללי';
  let _history = []; // [{role:'user'|'assistant', text:'...'}]

  const VIEW_LABELS = {
    dashboard:    'מסך ראשי / לוח שנה',
    summaries:    'עיון וניהול סיכומים',
    editor:       'עורך סיכום',
    'notes-full': 'פתקיות',
    books:        'מאגר ספרים',
    'active-chat':'למידה פעילה / תכנון',
    settings:     'הגדרות',
    help:         'עזרה',
    quiz:         'מסך בחינה',
  };

  function _getCurrentScreen() {
    return _currentScreen;
  }

  function updateScreen(viewId) {
    _currentScreen = VIEW_LABELS[viewId] || viewId || 'כללי';
    const label = document.getElementById('appGuideScreenLabel');
    if (label) label.textContent = `📍 ${_currentScreen}`;
  }

  function _mdToHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  function _appendMsg(role, text) {
    const box = document.getElementById('appGuideMsgs');
    if (!box) return;
    const div = document.createElement('div');
    div.className = `ai-msg ai-msg--${role}`;
    div.innerHTML = role === 'ai' ? _mdToHtml(text) : escHtml(text);
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }

  function _removeLast() {
    const box = document.getElementById('appGuideMsgs');
    const last = box?.querySelector('.ai-msg--system:last-child');
    if (last) last.remove();
  }

  async function _send() {
    const input = document.getElementById('appGuideInput');
    const msg = input?.value.trim();
    if (!msg) return;
    input.value = '';
    _appendMsg('user', msg);
    _appendMsg('system', '⏳ מחפש תשובה...');
    try {
      const res = await Api.aiAppGuide(msg, _currentScreen, _history);
      _removeLast();
      const answer = res.answer || 'אין תגובה';
      _appendMsg('ai', answer);
      // Keep last 10 turns (20 messages) to avoid oversized prompts
      _history.push({ role: 'user', text: msg });
      _history.push({ role: 'assistant', text: answer });
      if (_history.length > 20) _history = _history.slice(_history.length - 20);
    } catch (err) {
      _removeLast();
      _appendMsg('error', err.message);
    }
  }

  function _clearChat() {
    _history = [];
    const box = document.getElementById('appGuideMsgs');
    if (box) box.innerHTML = '';
  }

  function toggle() {
    const panel = document.getElementById('appGuidePanel');
    if (!panel) return;
    _open = !_open;
    panel.classList.toggle('app-guide-panel--open', _open);
    if (_open) {
      document.getElementById('appGuideScreenLabel').textContent = `📍 ${_currentScreen}`;
      document.getElementById('appGuideInput')?.focus();
    }
  }

  function init() {
    document.getElementById('appGuideToggleBtn')?.addEventListener('click', toggle);
    document.getElementById('appGuideCloseBtn')?.addEventListener('click', toggle);
    document.getElementById('appGuideSendBtn')?.addEventListener('click', _send);
    document.getElementById('appGuideClearBtn')?.addEventListener('click', _clearChat);
    document.getElementById('appGuideInput')?.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') _send();
    });
  }

  return { init, toggle, updateScreen };
})();
