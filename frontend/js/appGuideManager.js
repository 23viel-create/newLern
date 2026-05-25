// ─── מדריך AI הקשרי-מסך ─────────────────────────────────────────────────────
const AppGuideManager = (() => {
  let _open = false;

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
    const active = document.querySelector('.view.active');
    if (!active) return 'כללי';
    const id = active.id?.replace('view-', '') || 'כללי';
    return VIEW_LABELS[id] || id;
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
    const screen = _getCurrentScreen();
    _appendMsg('user', msg);
    _appendMsg('system', '⏳ מחפש תשובה...');
    try {
      const res = await Api.aiAppGuide(msg, screen);
      _removeLast();
      _appendMsg('ai', res.answer || 'אין תגובה');
    } catch (err) {
      _removeLast();
      _appendMsg('error', err.message);
    }
  }

  function toggle() {
    const panel = document.getElementById('appGuidePanel');
    if (!panel) return;
    _open = !_open;
    panel.classList.toggle('app-guide-panel--open', _open);
    if (_open) {
      const screen = _getCurrentScreen();
      document.getElementById('appGuideScreenLabel').textContent = `📍 ${screen}`;
      document.getElementById('appGuideInput')?.focus();
    }
  }

  function init() {
    document.getElementById('appGuideToggleBtn')?.addEventListener('click', toggle);
    document.getElementById('appGuideCloseBtn')?.addEventListener('click', toggle);
    document.getElementById('appGuideSendBtn')?.addEventListener('click', _send);
    document.getElementById('appGuideInput')?.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') _send();
    });
  }

  return { init, toggle };
})();
