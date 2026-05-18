// ─── מנהל מסך למידה פעילה עצמאי ─────────────────────────────────────────────
const ActiveChatManager = (() => {
  let _bound = false;

  function _mdToHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  function _appendMsg(role, text) {
    const box = document.getElementById('acChatMessages');
    if (!box) return;
    const div = document.createElement('div');
    div.className = `ai-msg ai-msg--${role}`;
    div.innerHTML = role === 'ai' ? _mdToHtml(text) : escHtml(text);
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }

  function _removeLast() {
    const box = document.getElementById('acChatMessages');
    const last = box?.querySelector('.ai-msg--system:last-child');
    if (last) last.remove();
  }

  async function _send() {
    const input = document.getElementById('acChatInput');
    const msg = input?.value.trim();
    if (!msg) return;
    input.value = '';
    _appendMsg('user', msg);
    _appendMsg('system', 'מחפש במאמרים...');
    try {
      const res = await Api.aiArticlesChat(msg);
      _removeLast();
      _appendMsg('ai', res.answer || 'אין תגובה');
    } catch (err) {
      _removeLast();
      _appendMsg('error', err.message);
    }
  }

  async function _generateProgram() {
    const goals = prompt('מהן מטרות הלמידה שלך? (תאר בקצרה)');
    if (!goals) return;
    const daysPerWeek = parseInt(prompt('כמה ימי לימוד בשבוע?', '5'), 10) || 5;
    const hoursPerDay = parseFloat(prompt('כמה שעות ביום?', '1')) || 1;
    _appendMsg('system', 'בונה תוכנית לימוד אישית...');
    try {
      const res = await Api.aiLearningProgram(goals, daysPerWeek, hoursPerDay);
      _removeLast();
      _appendMsg('ai', res.program || 'לא ניתן ליצור תוכנית');
    } catch (err) {
      _removeLast();
      _appendMsg('error', err.message);
    }
  }

  function init() {
    if (_bound) return;
    _bound = true;
    document.getElementById('acChatSendBtn')?.addEventListener('click', _send);
    document.getElementById('acChatInput')?.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') _send();
    });
    document.getElementById('acLearningProgramBtn')?.addEventListener('click', _generateProgram);
  }

  return { init };
})();
