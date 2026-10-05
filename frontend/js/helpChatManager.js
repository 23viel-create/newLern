// ─── מנהל צ'אט תמיכה במסך עזרה ──────────────────────────────────────────────
const HelpChatManager = (() => {
  let _bound = false;

  function _mdToHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  function _appendMsg(role, text) {
    const box = document.getElementById('helpChatMessages');
    if (!box) return;
    const div = document.createElement('div');
    div.className = `ai-msg ai-msg--${role}`;
    div.innerHTML = role === 'ai' ? _mdToHtml(text) : escHtml(text);
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }

  function _removeLast() {
    const box = document.getElementById('helpChatMessages');
    const last = box?.querySelector('.ai-msg--system:last-child');
    if (last) last.remove();
  }

  async function _send() {
    const input = document.getElementById('helpChatInput');
    const msg = input?.value.trim();
    if (!msg) return;
    input.value = '';
    _appendMsg('user', msg);
    _appendMsg('system', 'מחפש תשובה...');
    try {
      const res = await Api.aiSystemHelp(msg);
      _removeLast();
      _appendMsg('ai', res.answer || 'אין תגובה');
    } catch (err) {
      _removeLast();
      _appendMsg('error', err.message);
    }
  }

  function init() {
    if (_bound) return;
    _bound = true;
    document.getElementById('helpChatSendBtn')?.addEventListener('click', _send);
    document.getElementById('helpChatInput')?.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') _send();
    });
  }

  return { init };
})();
