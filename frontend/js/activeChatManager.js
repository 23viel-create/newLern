// ─── מנהל מסך למידה פעילה עצמאי ─────────────────────────────────────────────
const ActiveChatManager = (() => {
  let _bound = false;

  // ── Markdown renderer ──────────────────────────────────────────────────────
  function _mdToHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  // ── Chat helpers ──────────────────────────────────────────────────────────
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

  // ── Tab switching ─────────────────────────────────────────────────────────
  function _bindTabs() {
    document.querySelectorAll('.ac-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.actab;
        document.querySelectorAll('.ac-tab').forEach(b =>
          b.classList.toggle('ac-tab--active', b === btn));
        document.getElementById('acTabChat')?.classList.toggle('hidden', tab !== 'chat');
        document.getElementById('acTabSyllabus')?.classList.toggle('hidden', tab !== 'syllabus');
      });
    });
  }

  // ── Syllabus form ─────────────────────────────────────────────────────────
  function _bindSyllabusForm() {
    // Set today as default start date
    const startEl = document.getElementById('syllabusStartDate');
    if (startEl && !startEl.value) {
      startEl.value = new Date().toISOString().slice(0, 10);
    }

    // Toggle target date picker
    document.querySelectorAll('input[name="syllabusEnd"]').forEach(r => {
      r.addEventListener('change', () => {
        const showDate = document.querySelector('input[name="syllabusEnd"]:checked')?.value === 'date';
        document.getElementById('syllabusTargetDateRow')?.classList.toggle('hidden', !showDate);
      });
    });

    // Generate button
    document.getElementById('syllabusGenerateBtn')?.addEventListener('click', _generateSyllabus);
  }

  async function _generateSyllabus() {
    const bookName      = document.getElementById('syllabusBook')?.value.trim();
    const authorName    = document.getElementById('syllabusAuthor')?.value.trim() || '';
    const pace          = document.getElementById('syllabusPace')?.value.trim();
    const startDate     = document.getElementById('syllabusStartDate')?.value || '';
    const startingPoint = document.getElementById('syllabusStartingPoint')?.value.trim() || '';
    const endCond       = document.querySelector('input[name="syllabusEnd"]:checked')?.value || 'book';
    const targetDate    = document.getElementById('syllabusTargetDate')?.value || '';
    const skipShabbat   = document.getElementById('syllabusSkipShabbat')?.checked ?? true;
    const skipHolidays  = document.getElementById('syllabusSkipHolidays')?.checked ?? true;

    if (!bookName) { alert('יש להזין שם ספר'); return; }
    if (!pace)     { alert('יש להזין קצב התקדמות'); return; }
    if (endCond === 'date' && !targetDate) { alert('יש להזין תאריך יעד'); return; }

    const btn    = document.getElementById('syllabusGenerateBtn');
    const status = document.getElementById('syllabusStatus');
    const result = document.getElementById('syllabusResult');
    btn.disabled = true;
    status.textContent = '⏳ ה-AI מכין את תוכנית הלימוד...';
    status.className   = 'save-status';
    status.classList.remove('hidden');
    result.classList.add('hidden');

    try {
      const res = await Api.learningPlanGenerate({
        bookName, authorName, pace, endCondition: endCond,
        targetDate: endCond === 'date' ? targetDate : undefined,
        startDate, startingPoint: startingPoint || undefined, skipShabbat, skipHolidays,
      });

      const { count, firstDate, lastDate, tasks } = res;

      // Build preview
      const previewItems = tasks.slice(0, 7)
        .map(t => `<div class="syllabus-day"><span class="badge" style="background:#e0e7ff;color:#4f46e5;margin-left:0.4rem">${t.dueDate}</span>${escHtml(t.title)}</div>`)
        .join('');
      const moreNote = count > 7 ? `<div class="hint" style="margin-top:0.4rem">...ועוד ${count - 7} ימי לימוד נוספים</div>` : '';

      result.innerHTML = `
        <div class="syllabus-result__title">✅ תוכנית לימוד נוצרה בהצלחה!</div>
        <p class="hint">נוצרו <strong>${count}</strong> ימי לימוד — מ-<strong>${firstDate}</strong> עד <strong>${lastDate}</strong>.</p>
        <p class="hint" style="margin-bottom:0.6rem">הימים הוזרקו ללוח השנה שלך ויופיעו ב<strong>מסך ראשי</strong>.</p>
        <div class="syllabus-result__preview">${previewItems}${moreNote}</div>`;
      result.classList.remove('hidden');

      status.textContent = `✓ ${count} ימי לימוד נוצרו`;
      status.className   = 'save-status save-status--saved';
      setTimeout(() => status.classList.add('hidden'), 4000);
    } catch (err) {
      status.textContent = `שגיאה: ${err.message}`;
      status.className   = 'save-status';
      status.style.color = 'var(--color-danger)';
      setTimeout(() => { status.classList.add('hidden'); status.style.color = ''; }, 6000);
    } finally {
      btn.disabled = false;
    }
  }

  async function _runOptimize() {
    const btn    = document.getElementById('optimizeBtn');
    const result = document.getElementById('optimizeResult');
    if (!btn || !result) return;
    btn.disabled = true;
    result.innerHTML = '<p class="hint">⏳ ה-AI מנתח את לוח הלמידה...</p>';
    result.classList.remove('hidden');
    try {
      const res = await Api.learningPlanOptimize();
      const { recommendation, heavyDates, threshold } = res;
      const heavyHtml = heavyDates && heavyDates.length
        ? `<p class="hint" style="margin-bottom:0.4rem"><strong>ימים עמוסים (מעל ${threshold} משימות):</strong></p>` +
          heavyDates.map(d => `<div class="hint">📅 ${d.date}: <strong>${d.count}</strong> משימות</div>`).join('')
        : '';
      result.innerHTML = `
        ${heavyHtml}
        <div class="optimize-recommendation">${escHtml(recommendation).replace(/\n/g,'<br>')}</div>`;
    } catch (err) {
      result.innerHTML = `<p class="hint error-text">שגיאה: ${escHtml(err.message)}</p>`;
    } finally {
      btn.disabled = false;
    }
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    if (_bound) return;
    _bound = true;
    document.getElementById('acChatSendBtn')?.addEventListener('click', _send);
    document.getElementById('acChatInput')?.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') _send();
    });
    document.getElementById('acLearningProgramBtn')?.addEventListener('click', _generateProgram);
    document.getElementById('optimizeBtn')?.addEventListener('click', _runOptimize);
    _bindTabs();
    _bindSyllabusForm();
  }

  return { init };
})();
