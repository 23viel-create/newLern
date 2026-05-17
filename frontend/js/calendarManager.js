// מנהל לוח השנה הדו-לשוני ולוח בקרה
const CalendarManager = (() => {

  const MONTH_NAMES_HE = [
    '', 'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
    'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
  ];

  // Sun–Sat headers (Hebrew week starts Sunday, RTL: Sun on right → Sat on left)
  const DOW_HEADERS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

  // Hebrew day numerals 1–30
  const HEB_NUMS = [
    '', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט',
    'י', 'יא', 'יב', 'יג', 'יד', 'טו', 'טז', 'יז', 'יח', 'יט',
    'כ', 'כא', 'כב', 'כג', 'כד', 'כה', 'כו', 'כז', 'כח', 'כט', 'ל',
  ];

  const DOW_NAMES_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

  let currentYear  = new Date().getFullYear();
  let currentMonth = new Date().getMonth() + 1;
  let selectedDate = new Date().toISOString().split('T')[0]; // default: today
  let calendarData = null; // last loaded { days, settings }

  // ── Init ──────────────────────────────────────────────────────────────────

  function init() {
    _bindNav();
    loadCalendar();
  }

  function _bindNav() {
    document.getElementById('calPrevMonth').addEventListener('click', () => {
      currentMonth--;
      if (currentMonth < 1) { currentMonth = 12; currentYear--; }
      loadCalendar();
    });
    document.getElementById('calNextMonth').addEventListener('click', () => {
      currentMonth++;
      if (currentMonth > 12) { currentMonth = 1; currentYear++; }
      loadCalendar();
    });
    document.getElementById('calTodayBtn').addEventListener('click', () => {
      const now = new Date();
      currentYear  = now.getFullYear();
      currentMonth = now.getMonth() + 1;
      selectedDate = now.toISOString().split('T')[0];
      loadCalendar();
    });
  }

  // ── Load ──────────────────────────────────────────────────────────────────

  async function loadCalendar() {
    const ym = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
    document.getElementById('calMonthLabel').textContent =
      `${MONTH_NAMES_HE[currentMonth]} ${currentYear}`;

    try {
      calendarData = await Api.getCalendarData(ym);
      _renderGrid(calendarData.days);
      _renderTaskPanel(selectedDate);
    } catch (err) {
      document.getElementById('calGrid').innerHTML =
        `<p class="placeholder-text error-text">שגיאה בטעינת לוח השנה: ${_esc(err.message)}</p>`;
    }
  }

  // ── Grid rendering ────────────────────────────────────────────────────────

  function _renderGrid(days) {
    const grid = document.getElementById('calGrid');

    const headerHtml = DOW_HEADERS
      .map(h => `<div class="cal-header-cell">${h}</div>`)
      .join('');

    // Leading empty cells (0=Sun offset)
    const firstDow = new Date(currentYear, currentMonth - 1, 1).getDay();
    let cells = '';
    for (let i = 0; i < firstDow; i++) {
      cells += '<div class="cal-cell cal-cell--empty"></div>';
    }

    for (const day of days) cells += _renderDayCell(day);

    grid.innerHTML = headerHtml + cells;

    // Click handlers
    grid.querySelectorAll('.cal-cell[data-date]').forEach(cell => {
      cell.addEventListener('click', () => {
        if (cell.classList.contains('cal-cell--blocked')) return;
        selectedDate = cell.dataset.date;
        grid.querySelectorAll('.cal-cell--selected')
            .forEach(c => c.classList.remove('cal-cell--selected'));
        cell.classList.add('cal-cell--selected');
        _renderTaskPanel(selectedDate);
      });
    });

    // Restore selection highlight
    if (selectedDate) {
      const sel = grid.querySelector(`[data-date="${selectedDate}"]`);
      if (sel) sel.classList.add('cal-cell--selected');
    }
  }

  function _renderDayCell(day) {
    const colorCls = _colorClass(day);
    const classes  = [
      'cal-cell',
      colorCls,
      day.isToday   ? 'cal-cell--today'   : '',
      day.isShabbat ? 'cal-cell--shabbat' : '',
      day.isHoliday ? 'cal-cell--holiday' : '',
      (day.isShabbat || day.isHoliday) ? 'cal-cell--blocked' : '',
    ].filter(Boolean).join(' ');

    const gregDay = Number(day.date.split('-')[2]);
    const badge   = day.totalTasks > 0
      ? `<span class="cal-badge">${day.totalTasks}</span>`
      : '';

    return `<div class="${classes}" data-date="${day.date}">
      ${badge}
      <span class="cal-cell__greg">${gregDay}</span>
      <span class="cal-cell__heb">${HEB_NUMS[day.hebrewDay] || day.hebrewDay}</span>
    </div>`;
  }

  function _colorClass(day) {
    if (day.isShabbat || day.isHoliday) return '';
    if (day.isPast || day.isToday) {
      if (day.totalTasks === 0) return '';
      const pct = day.doneTasks / day.totalTasks;
      if (pct >= 1)    return 'cal-cell--done';
      if (pct >= 0.01) return 'cal-cell--partial';
      return 'cal-cell--missed';
    }
    // Future
    const n   = day.totalTasks;
    const thr = calendarData?.settings?.heavyLoadThreshold ?? 9;
    if (n === 0)    return 'cal-cell--load-0';
    if (n <= 3)     return 'cal-cell--load-low';
    if (n < thr)    return 'cal-cell--load-mid';
    return 'cal-cell--load-high';
  }

  // ── Task panel ────────────────────────────────────────────────────────────

  async function _renderTaskPanel(dateStr) {
    const panel    = document.getElementById('calTaskPanel');
    const dateLabel = document.getElementById('calTaskDate');

    if (!dateStr) {
      dateLabel.textContent = 'בחר יום';
      panel.innerHTML = '<p class="placeholder-text">לחץ על יום בלוח לצפייה במשימות</p>';
      return;
    }

    dateLabel.textContent = _formatDateLabel(dateStr);
    panel.innerHTML = '<p class="placeholder-text">טוען...</p>';

    try {
      const schedule = await Api.getSchedule();
      const tasks    = (schedule.tasks || []).filter(t => t.dueDate === dateStr);

      if (!tasks.length) {
        panel.innerHTML = '<p class="placeholder-text">אין משימות ביום זה</p>';
        return;
      }

      panel.innerHTML = tasks.map(_renderTaskItem).join('');

      panel.querySelectorAll('.task-done-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          try {
            btn.disabled = true;
            await Api.completeTask(btn.dataset.id, 3);
            loadCalendar(); // refresh grid + panel
          } catch (err) {
            btn.disabled = false;
            alert(`שגיאה: ${err.message}`);
          }
        });
      });
    } catch (err) {
      panel.innerHTML =
        `<p class="placeholder-text error-text">שגיאה: ${_esc(err.message)}</p>`;
    }
  }

  function _renderTaskItem(task) {
    const TYPE_LABEL = { completion: 'לימוד', review: 'חזרה', quiz: 'חידון', study: 'תרגול' };
    const typeLabel  = TYPE_LABEL[task.type] || task.type;
    const done       = task.completed;
    const revBadge   = task.reviewNumber
      ? `<span class="task-item__num">חזרה ${task.reviewNumber}</span>`
      : '';
    return `
      <div class="task-item ${done ? 'task-item--done' : ''}">
        <div class="task-item__info">
          <span class="task-item__type">${_esc(typeLabel)}</span>
          <span class="task-item__title">${_esc(task.title || task.summaryPath)}</span>
          ${revBadge}
        </div>
        ${done
          ? '<span class="task-item__status">✓ הושלם</span>'
          : `<button class="btn btn--xs btn--primary task-done-btn" data-id="${_esc(task.id)}">סיימתי ✓</button>`
        }
      </div>`;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _formatDateLabel(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dow = new Date(y, m - 1, d).getDay();
    return `יום ${DOW_NAMES_HE[dow]}, ${d} ב${MONTH_NAMES_HE[m]} ${y}`;
  }

  // ── Public ────────────────────────────────────────────────────────────────

  return { init, loadCalendar };
})();
