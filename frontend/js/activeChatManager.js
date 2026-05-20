// ─── מנהל מסך למידה פעילה עצמאי ─────────────────────────────────────────────
const ActiveChatManager = (() => {
  let _bound       = false;
  let _currentPaths = [];   // cache for inline onclick lookups
  let _pendingEdit  = null;  // { id, pace } while backlog modal is open

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
        document.getElementById('acTabPaths')?.classList.toggle('hidden', tab !== 'paths');
        if (tab === 'paths') _loadStudyPaths();
      });
    });
  }

  // ── Study Paths manager ───────────────────────────────────────────────────

  async function _loadStudyPaths() {
    const list = document.getElementById('studyPathsList');
    if (!list) return;
    list.innerHTML = '<p class="hint study-paths-empty">⏳ טוען מסלולים...</p>';
    try {
      const paths = await Api.getStudyPaths();
      _renderStudyPaths(paths);
    } catch (err) {
      list.innerHTML = `<p class="hint study-paths-empty" style="color:var(--color-danger)">שגיאה: ${escHtml(err.message)}</p>`;
    }
  }

  function _renderStudyPaths(paths) {
    _currentPaths = paths || [];
    const list = document.getElementById('studyPathsList');
    if (!list) return;
    _hideEditPanel();
    if (!_currentPaths.length) {
      list.innerHTML = '<p class="hint study-paths-empty">אין מסלולי למידה פעילים. צור מסלול חדש בכרטיסייה "גנרטור".</p>';
      return;
    }
    list.innerHTML = _currentPaths.map(p => {
      const total     = p.totalCount || p.taskCount || 0;
      const completed = p.completedCount || 0;
      const backlog   = p.backlogCount  || 0;
      const pct       = total ? Math.round((completed / total) * 100) : 0;
      const unitInfo  = p.isCustomBook && p.unitType
        ? ` | ${p.unitType} ${p.startUnit}–${p.endUnit}` : '';
      const dateRange = p.startDate && p.endDate
        ? `${p.startDate} עד ${p.endDate}` : '';
      const backlogBadge = backlog > 0
        ? `<span class="study-path-item__backlog-badge">⚠️ ${backlog} ימים בפיגור</span>` : '';
      const paceSafe    = escHtml(p.pace).replace(/'/g, "\\'");
      const bookSafe    = escHtml(p.bookName).replace(/'/g, "\\'");
      return `
        <div class="study-path-item" data-pathid="${escHtml(p.id)}">
          <div class="study-path-item__header">
            <div>
              <div class="study-path-item__title">${escHtml(p.bookName)}${p.authorName ? ` — ${escHtml(p.authorName)}` : ''}</div>
              <div class="study-path-item__subtitle">קצב: ${escHtml(p.pace)}${unitInfo}</div>
            </div>
            <div class="study-path-item__actions">
              <button class="btn btn--ghost btn--sm" onclick="ActiveChatManager._editPath('${escHtml(p.id)}','${paceSafe}')">✏️ ערוך</button>
              <button class="btn btn--ghost btn--sm" style="color:var(--color-danger)" onclick="ActiveChatManager._deletePath('${escHtml(p.id)}','${bookSafe}')">🗑️ מחק</button>
            </div>
          </div>
          <div class="study-path-item__meta">
            ${dateRange ? `<span>📅 ${dateRange}</span>` : ''}
            <span>📋 סה"כ ${total} ימי לימוד</span>
            ${p.isCustomBook ? '<span>📌 ספר מותאם אישית</span>' : ''}
          </div>
          <div class="study-path-item__progress">${completed} / ${total} ימים הושלמו (${pct}%)${backlogBadge}</div>
        </div>`;
    }).join('');
  }

  async function _deletePath(id, bookName) {
    if (!confirm(`למחוק את המסלול "${bookName}"?\nכל משימות המסלול יוסרו מלוח השנה.`)) return;
    try {
      await Api.deleteStudyPath(id);
      await _loadStudyPaths();
    } catch (err) {
      alert(`שגיאה במחיקה: ${err.message}`);
    }
  }

  // ── Edit path: detect backlog first ──────────────────────────────────────

  function _editPath(id, currentPace) {
    const pathData = _currentPaths.find(p => p.id === id);

    if (pathData && (pathData.backlogCount || 0) > 0) {
      _showBacklogModal(pathData);
    } else {
      _showEditPanel(id, currentPace, null);
    }
  }

  // ── Backlog Resolution Modal ──────────────────────────────────────────────

  function _showBacklogModal(pathData) {
    _pendingEdit = { id: pathData.id, pace: pathData.pace };

    const modal = document.getElementById('backlogModal');
    if (!modal) return;

    const backlog  = pathData.backlogCount || 0;
    const units    = pathData.backlogUnits || backlog;
    const unitLbl  = pathData.isCustomBook && pathData.unitType
      ? `(${units} ${pathData.unitType})`
      : '';

    const desc = document.getElementById('backlogModalDesc');
    if (desc) {
      desc.innerHTML = `נמצאו <strong>${backlog} יום</strong> שלא הושלמו ${unitLbl} עד היום בספר <strong>${escHtml(pathData.bookName)}</strong>.<br>בחר כיצד לטפל בפיגור:`;
    }

    // Reset radio and error
    document.querySelectorAll('input[name="backlogMode"]').forEach(r => { r.checked = false; });
    document.querySelectorAll('.backlog-option').forEach(el => el.classList.remove('backlog-option--selected'));
    document.getElementById('backlogModalError')?.classList.add('hidden');

    modal.classList.remove('hidden');
  }

  function _hideBacklogModal() {
    document.getElementById('backlogModal')?.classList.add('hidden');
    _pendingEdit = null;
  }

  function _onBacklogContinue() {
    const selected = document.querySelector('input[name="backlogMode"]:checked');
    if (!selected) {
      document.getElementById('backlogModalError')?.classList.remove('hidden');
      return;
    }
    const mode = selected.value; // 'compress' | 'extend' | 'independent'
    const { id, pace } = _pendingEdit;
    _hideBacklogModal();
    _showEditPanel(id, pace, mode);
  }

  // ── Edit Panel ────────────────────────────────────────────────────────────

  function _showEditPanel(id, currentPace, resolutionMode) {
    const panel = document.getElementById('studyPathEditPanel');
    if (!panel) return;

    document.getElementById('editPathId').value          = id;
    document.getElementById('editPathPace').value        = currentPace || '';
    document.getElementById('editResolutionMode').value  = resolutionMode || '';
    document.getElementById('editPanelToday').textContent = new Date().toISOString().slice(0, 10);
    document.getElementById('editPathStatus')?.classList.add('hidden');

    // Update warning text to reflect resolution mode if applicable
    const warningEl = panel.querySelector('.path-edit-warning');
    if (warningEl) {
      const modeLabel = {
        compress:    '🗜️ דחיסה אל תוך התוכנית (פיגור יכוסס)',
        extend:      '📅 הארכת תאריך הסיום (שמירת קצב)',
        independent: '🏃 השלמה עצמאית (פיגור מדולג)',
      }[resolutionMode] || null;

      warningEl.innerHTML = `⚠️ <strong>שים לב:</strong> עריכת המסלול תשפיע רק מתאריך העריכה (<span id="editPanelToday">${new Date().toISOString().slice(0, 10)}</span>) והלאה, ולא תשנה היסטוריית למידה שכבר בוצעה.`
        + (modeLabel ? `<br><strong>אסטרטגיה:</strong> ${modeLabel}` : '');
    }

    panel.classList.remove('hidden');
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function _hideEditPanel() {
    document.getElementById('studyPathEditPanel')?.classList.add('hidden');
  }

  async function _submitEdit() {
    const id             = document.getElementById('editPathId')?.value;
    const pace           = document.getElementById('editPathPace')?.value.trim();
    const resolutionMode = document.getElementById('editResolutionMode')?.value || undefined;
    const skipShabbat    = document.getElementById('editPathSkipShabbat')?.checked ?? true;
    const skipHolidays   = document.getElementById('editPathSkipHolidays')?.checked ?? true;
    if (!id) return;

    const btn    = document.getElementById('editPathConfirmBtn');
    const status = document.getElementById('editPathStatus');
    btn.disabled = true;
    status.textContent = '⏳ ה-AI מחשב מחדש...';
    status.className   = 'save-status';
    status.classList.remove('hidden');

    try {
      const res = await Api.editStudyPath(id, {
        pace: pace || undefined,
        skipShabbat,
        skipHolidays,
        resolutionMode: resolutionMode || undefined,
      });
      status.textContent = `✓ ${res.count} משימות חדשות נוצרו מהיום`;
      status.className   = 'save-status save-status--saved';
      setTimeout(async () => {
        _hideEditPanel();
        await _loadStudyPaths();
        // Trigger calendar refresh if function exists
        if (typeof loadCalendar === 'function') loadCalendar();
      }, 1800);
    } catch (err) {
      status.textContent = `שגיאה: ${err.message}`;
      status.className   = 'save-status save-status--error';
    } finally {
      btn.disabled = false;
    }
  }

  // ── Syllabus form ─────────────────────────────────────────────────────────
  function _bindSyllabusForm() {
    const startEl = document.getElementById('syllabusStartDate');
    if (startEl && !startEl.value) {
      startEl.value = new Date().toISOString().slice(0, 10);
    }

    document.querySelectorAll('input[name="syllabusEnd"]').forEach(r => {
      r.addEventListener('change', () => {
        const showDate = document.querySelector('input[name="syllabusEnd"]:checked')?.value === 'date';
        document.getElementById('syllabusTargetDateRow')?.classList.toggle('hidden', !showDate);
      });
    });

    document.getElementById('syllabusCustomBook')?.addEventListener('change', (e) => {
      const isCustom = e.target.checked;
      document.getElementById('syllabusCustomSection')?.classList.toggle('hidden', !isCustom);
      document.getElementById('syllabusUnitReqBadge')?.classList.toggle('hidden', !isCustom);
      document.getElementById('syllabusUnitReqBadge2')?.classList.toggle('hidden', !isCustom);
      document.getElementById('syllabusUnitRequiredHint')?.classList.add('hidden');
    });

    document.getElementById('syllabusGenerateBtn')?.addEventListener('click', _generateSyllabus);
  }

  async function _generateSyllabus() {
    const bookName        = document.getElementById('syllabusBook')?.value.trim();
    const authorName      = document.getElementById('syllabusAuthor')?.value.trim() || '';
    const pace            = document.getElementById('syllabusPace')?.value.trim();
    const startDate       = document.getElementById('syllabusStartDate')?.value || '';
    const hebrewStartDate = document.getElementById('syllabusHebrewDate')?.value.trim() || '';
    const startingPoint   = document.getElementById('syllabusStartingPoint')?.value.trim() || '';
    const endCond         = document.querySelector('input[name="syllabusEnd"]:checked')?.value || 'book';
    const targetDate      = document.getElementById('syllabusTargetDate')?.value || '';
    const skipShabbat     = document.getElementById('syllabusSkipShabbat')?.checked ?? true;
    const skipHolidays    = document.getElementById('syllabusSkipHolidays')?.checked ?? true;
    const isCustomBook    = document.getElementById('syllabusCustomBook')?.checked ?? false;
    const unitType        = document.getElementById('syllabusUnitType')?.value || 'עמודים';
    const startUnitRaw    = document.getElementById('syllabusStartUnit')?.value;
    const endUnitRaw      = document.getElementById('syllabusEndUnit')?.value;
    const startUnit       = startUnitRaw ? Number(startUnitRaw) : undefined;
    const endUnit         = endUnitRaw   ? Number(endUnitRaw)   : undefined;

    if (!bookName) { alert('יש להזין שם ספר'); return; }
    if (!pace)     { alert('יש להזין קצב התקדמות'); return; }
    if (endCond === 'date' && !targetDate) { alert('יש להזין תאריך יעד'); return; }

    if (isCustomBook && (!startUnit || !endUnit)) {
      document.getElementById('syllabusUnitRequiredHint')?.classList.remove('hidden');
      document.getElementById('syllabusStartUnit')?.focus();
      return;
    }
    document.getElementById('syllabusUnitRequiredHint')?.classList.add('hidden');

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
        targetDate:       endCond === 'date' ? targetDate : undefined,
        startDate,
        hebrewStartDate:  hebrewStartDate || undefined,
        startingPoint:    startingPoint   || undefined,
        skipShabbat, skipHolidays,
        isCustomBook,
        unitType:   isCustomBook ? unitType : undefined,
        startUnit,
        endUnit,
      });

      const { count, firstDate, lastDate, tasks } = res;
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

    // Edit panel
    document.getElementById('editPathConfirmBtn')?.addEventListener('click', _submitEdit);
    document.getElementById('editPathCancelBtn')?.addEventListener('click', _hideEditPanel);

    // Backlog modal
    document.getElementById('backlogModalContinue')?.addEventListener('click', _onBacklogContinue);
    document.getElementById('backlogModalCancel')?.addEventListener('click', _hideBacklogModal);
    document.getElementById('backlogModal')?.querySelector('.modal__overlay')
      ?.addEventListener('click', _hideBacklogModal);

    // Highlight selected option card
    document.querySelectorAll('input[name="backlogMode"]').forEach(radio => {
      radio.addEventListener('change', () => {
        document.querySelectorAll('.backlog-option').forEach(el =>
          el.classList.remove('backlog-option--selected'));
        radio.closest('.backlog-option')?.classList.add('backlog-option--selected');
        document.getElementById('backlogModalError')?.classList.add('hidden');
      });
    });

    _bindTabs();
    _bindSyllabusForm();
  }

  // Expose path methods for inline onclick handlers
  return { init, _editPath, _deletePath };
})();
