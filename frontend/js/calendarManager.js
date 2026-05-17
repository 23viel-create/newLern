// מנהל לוח השנה הדו-לשוני ולוח בקרה
const CalendarManager = (() => {

  const MONTH_NAMES_GREG = [
    '', 'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
    'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
  ];

  const HEBREW_MONTH_NAMES = {
    1:'ניסן', 2:'אייר', 3:'סיוון', 4:'תמוז', 5:'אב', 6:'אלול',
    7:'תשרי', 8:'חשוון', 9:'כסלו', 10:'טבת', 11:'שבט', 12:'אדר', 13:'אדר ב׳',
  };

  // Sun–Sat headers (Hebrew week starts Sunday, RTL display)
  const DOW_HEADERS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

  const HEB_NUMS = [
    '', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט',
    'י', 'יא', 'יב', 'יג', 'יד', 'טו', 'טז', 'יז', 'יח', 'יט',
    'כ', 'כא', 'כב', 'כג', 'כד', 'כה', 'כו', 'כז', 'כח', 'כט', 'ל',
  ];

  const DOW_NAMES_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

  let _calDisplayPref = 'combined';
  let _navBound  = false;        // prevent duplicate listeners from repeated init()
  let _viewMode  = 'monthly';    // 'monthly' | 'weekly' | 'daily'

  let currentYear  = new Date().getFullYear();
  let currentMonth = new Date().getMonth() + 1;
  let selectedDate = new Date().toISOString().split('T')[0];
  let calendarData = null;
  let _monthCache  = {};          // 'YYYY-MM' → calendarData

  // ── Gematria ───────────────────────────────────────────────────────────────

  function _toGematria(year) {
    const UNITS    = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
    const TENS     = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
    const HUNDREDS = ['', 'ק', 'ר', 'ש', 'ת', 'תק', 'תר', 'תש', 'תת', 'תתק'];

    const thousands = Math.floor(year / 1000);
    const remainder = year % 1000;
    const h = Math.floor(remainder / 100);
    const t = Math.floor((remainder % 100) / 10);
    const u = remainder % 10;

    let body = HUNDREDS[h] || '';
    if (t === 1 && u === 5) body += 'טו';       // avoid יה (divine name)
    else if (t === 1 && u === 6) body += 'טז';  // avoid יו
    else body += (TENS[t] || '') + (UNITS[u] || '');

    if (body.length === 1)      body = body + '׳';
    else if (body.length > 1)   body = body.slice(0, -1) + '"' + body.slice(-1);

    return `${UNITS[thousands] || String(thousands)}'${body}`;
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  function init() {
    if (!_navBound) {
      _bindNav();
      _navBound = true;
    }
    loadCalendar();
  }

  function _bindNav() {
    document.getElementById('calPrevMonth').addEventListener('click', () => {
      if (_viewMode === 'weekly') {
        const d = new Date(selectedDate + 'T12:00:00');
        d.setDate(d.getDate() - 7);
        selectedDate = _isoDate(d);
        currentYear  = d.getFullYear();
        currentMonth = d.getMonth() + 1;
      } else if (_viewMode === 'daily') {
        const d = new Date(selectedDate + 'T12:00:00');
        d.setDate(d.getDate() - 1);
        selectedDate = _isoDate(d);
        currentYear  = d.getFullYear();
        currentMonth = d.getMonth() + 1;
      } else {
        // monthly — navigate by Hebrew month when in Hebrew mode
        if (_calDisplayPref === 'hebrew') {
          _shiftHebMonth(-1);
        } else {
          currentMonth--;
          if (currentMonth < 1) { currentMonth = 12; currentYear--; }
        }
      }
      loadCalendar();
    });

    document.getElementById('calNextMonth').addEventListener('click', () => {
      if (_viewMode === 'weekly') {
        const d = new Date(selectedDate + 'T12:00:00');
        d.setDate(d.getDate() + 7);
        selectedDate = _isoDate(d);
        currentYear  = d.getFullYear();
        currentMonth = d.getMonth() + 1;
      } else if (_viewMode === 'daily') {
        const d = new Date(selectedDate + 'T12:00:00');
        d.setDate(d.getDate() + 1);
        selectedDate = _isoDate(d);
        currentYear  = d.getFullYear();
        currentMonth = d.getMonth() + 1;
      } else {
        if (_calDisplayPref === 'hebrew') {
          _shiftHebMonth(+1);
        } else {
          currentMonth++;
          if (currentMonth > 12) { currentMonth = 1; currentYear++; }
        }
      }
      loadCalendar();
    });

    document.getElementById('calTodayBtn').addEventListener('click', () => {
      const now = new Date();
      currentYear  = now.getFullYear();
      currentMonth = now.getMonth() + 1;
      selectedDate = _isoDate(now);
      loadCalendar();
    });

    // View toggle buttons
    document.querySelectorAll('.cal-view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        _viewMode = btn.dataset.view;
        document.querySelectorAll('.cal-view-btn').forEach(b =>
          b.classList.toggle('cal-view-btn--active', b === btn));
        loadCalendar();
      });
    });
  }

  // Hebrew month navigation: find the last (or first) day of current Hebrew month,
  // step by ±1 day to land in the adjacent Hebrew month, update currentYear/Month.
  function _shiftHebMonth(direction) {
    if (!calendarData) {
      currentMonth += direction;
      if (currentMonth < 1)  { currentMonth = 12; currentYear--; }
      if (currentMonth > 12) { currentMonth = 1;  currentYear++; }
      return;
    }
    const mid = calendarData.days[Math.floor(calendarData.days.length / 2)];
    const hebY = mid.hebrewYear;
    const hebM = mid.hebrewMonth;

    if (direction > 0) {
      // Find last day of this Hebrew month, step forward 1 day
      const lastHeb = calendarData.days.filter(d => d.hebrewYear === hebY && d.hebrewMonth === hebM);
      if (lastHeb.length) {
        const lastDate = new Date(lastHeb[lastHeb.length - 1].date + 'T12:00:00');
        lastDate.setDate(lastDate.getDate() + 1);
        currentYear  = lastDate.getFullYear();
        currentMonth = lastDate.getMonth() + 1;
        return;
      }
    } else {
      // Find first day of this Hebrew month, step back 1 day
      const firstHeb = calendarData.days.find(d => d.hebrewYear === hebY && d.hebrewMonth === hebM);
      if (firstHeb) {
        const firstDate = new Date(firstHeb.date + 'T12:00:00');
        firstDate.setDate(firstDate.getDate() - 1);
        currentYear  = firstDate.getFullYear();
        currentMonth = firstDate.getMonth() + 1;
        return;
      }
    }
    // Fallback
    currentMonth += direction;
    if (currentMonth < 1)  { currentMonth = 12; currentYear--; }
    if (currentMonth > 12) { currentMonth = 1;  currentYear++; }
  }

  // ── Month data cache ──────────────────────────────────────────────────────

  async function _getMonthData(y, m) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    if (!_monthCache[key]) {
      _monthCache[key] = await Api.getCalendarData(key);
    }
    return _monthCache[key];
  }

  // ── Load ──────────────────────────────────────────────────────────────────

  async function loadCalendar() {
    const grid = document.getElementById('calGrid');
    try {
      calendarData = await _getMonthData(currentYear, currentMonth);
      _calDisplayPref = calendarData?.settings?.calendarDisplayPreference || 'combined';

      if (_viewMode === 'monthly') {
        if (_calDisplayPref === 'hebrew') {
          await _renderHebrewMonthGrid();
        } else {
          _updateMonthLabel();
          _renderGrid(calendarData.days);
          _renderTaskPanel(selectedDate);
        }
      } else if (_viewMode === 'weekly') {
        await _renderWeekly();
      } else {
        await _renderDaily();
      }
    } catch (err) {
      grid.innerHTML =
        `<p class="placeholder-text error-text">שגיאה בטעינת לוח השנה: ${_esc(err.message)}</p>`;
    }
  }

  // ── Hebrew month grid ─────────────────────────────────────────────────────

  async function _renderHebrewMonthGrid() {
    const mid    = calendarData.days[Math.floor(calendarData.days.length / 2)];
    const hebY   = mid.hebrewYear;
    const hebM   = mid.hebrewMonth;

    let allDays = [...calendarData.days];

    // If day 1 of the Hebrew month isn't in current Gregorian month, load prev month too
    const hasDay1 = calendarData.days.some(d =>
      d.hebrewYear === hebY && d.hebrewMonth === hebM && d.hebrewDay === 1);
    if (!hasDay1) {
      let py = currentYear, pm = currentMonth - 1;
      if (pm < 1) { pm = 12; py--; }
      const prevData = await _getMonthData(py, pm);
      allDays = [...prevData.days, ...allDays];
    }

    // If the Hebrew month extends into the next Gregorian month, load next month too
    const hebHere = allDays.filter(d => d.hebrewYear === hebY && d.hebrewMonth === hebM);
    const maxHebDay = hebHere.length ? Math.max(...hebHere.map(d => d.hebrewDay)) : 0;
    if (maxHebDay < 29) {
      let ny = currentYear, nm = currentMonth + 1;
      if (nm > 12) { nm = 1; ny++; }
      const nextData = await _getMonthData(ny, nm);
      allDays = [...allDays, ...nextData.days];
    }

    const hebMonthDays = allDays.filter(d =>
      d.hebrewYear === hebY && d.hebrewMonth === hebM);

    // Gregorian months spanned for subtitle
    const gregMonthSet = new Set(hebMonthDays.map(d => {
      const [, m] = d.date.split('-').map(Number);
      return MONTH_NAMES_GREG[m];
    }));
    const gregSub = [...gregMonthSet].join(' – ');

    const label = document.getElementById('calMonthLabel');
    if (label) {
      const hebName = HEBREW_MONTH_NAMES[hebM] || `חודש ${hebM}`;
      label.innerHTML =
        `<strong>${hebName} ${_toGematria(hebY)}</strong> <span class="cal-month-sub">(${gregSub})</span>`;
    }

    const grid = document.getElementById('calGrid');
    const headerHtml = DOW_HEADERS.map(h => `<div class="cal-header-cell">${h}</div>`).join('');

    let cells = '';
    if (hebMonthDays.length > 0) {
      const firstDow = new Date(hebMonthDays[0].date + 'T12:00:00').getDay();
      for (let i = 0; i < firstDow; i++) cells += '<div class="cal-cell cal-cell--empty"></div>';
    }
    for (const day of hebMonthDays) cells += _renderDayCell(day, true);

    grid.innerHTML = headerHtml + cells;
    _attachGridClicks(grid);
    _restoreSelection(grid);
    _renderTaskPanel(selectedDate);
  }

  // ── Month label ───────────────────────────────────────────────────────────

  function _updateMonthLabel() {
    const label = document.getElementById('calMonthLabel');
    if (!label) return;

    const midDay   = calendarData?.days?.find(d => d.hebrewDay === 15) || calendarData?.days?.[14];
    const hebMonth = midDay ? HEBREW_MONTH_NAMES[midDay.hebrewMonth] : null;
    const hebYear  = midDay ? _toGematria(midDay.hebrewYear) : null;

    const gregLabel = `${MONTH_NAMES_GREG[currentMonth]} ${currentYear}`;
    const hebLabel  = hebMonth ? `${hebMonth} ${hebYear}` : '';

    if (_calDisplayPref === 'gregorian') {
      label.innerHTML = `${gregLabel}` +
        (hebLabel ? ` <span class="cal-month-sub">(${hebLabel})</span>` : '');
    } else {
      // combined (default)
      label.innerHTML = hebLabel
        ? `<strong>${hebLabel}</strong> <span class="cal-month-sub">(${gregLabel})</span>`
        : gregLabel;
    }
  }

  // ── Grid rendering ────────────────────────────────────────────────────────

  function _renderGrid(days) {
    const grid = document.getElementById('calGrid');
    const headerHtml = DOW_HEADERS.map(h => `<div class="cal-header-cell">${h}</div>`).join('');

    const firstDow = new Date(currentYear, currentMonth - 1, 1).getDay();
    let cells = '';
    for (let i = 0; i < firstDow; i++) cells += '<div class="cal-cell cal-cell--empty"></div>';
    for (const day of days) cells += _renderDayCell(day);

    grid.innerHTML = headerHtml + cells;
    _attachGridClicks(grid);
    _restoreSelection(grid);
  }

  function _attachGridClicks(grid) {
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
  }

  function _restoreSelection(grid) {
    if (selectedDate) {
      const sel = grid.querySelector(`[data-date="${selectedDate}"]`);
      if (sel) sel.classList.add('cal-cell--selected');
    }
  }

  function _renderDayCell(day, hebPrimary = false) {
    const colorCls = _colorClass(day);
    const classes  = [
      'cal-cell', colorCls,
      day.isToday   ? 'cal-cell--today'   : '',
      day.isShabbat ? 'cal-cell--shabbat' : '',
      day.isHoliday ? 'cal-cell--holiday' : '',
      (day.isShabbat || day.isHoliday) ? 'cal-cell--blocked' : '',
    ].filter(Boolean).join(' ');

    const gregDay = Number(day.date.split('-')[2]);
    const badge   = day.totalTasks > 0 ? `<span class="cal-badge">${day.totalTasks}</span>` : '';

    if (hebPrimary || _calDisplayPref === 'hebrew') {
      return `<div class="${classes}" data-date="${day.date}">
        ${badge}
        <span class="cal-cell__heb cal-cell__heb--primary">${HEB_NUMS[day.hebrewDay] || day.hebrewDay}</span>
        <span class="cal-cell__greg cal-cell__greg--sub">${gregDay}</span>
      </div>`;
    }
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
    const n   = day.totalTasks;
    const thr = calendarData?.settings?.heavyLoadThreshold ?? 9;
    if (n === 0)   return 'cal-cell--load-0';
    if (n <= 3)    return 'cal-cell--load-low';
    if (n < thr)   return 'cal-cell--load-mid';
    return 'cal-cell--load-high';
  }

  // ── Weekly view ───────────────────────────────────────────────────────────

  async function _renderWeekly() {
    const base   = new Date(selectedDate + 'T12:00:00');
    const sunday = new Date(base);
    sunday.setDate(base.getDate() - base.getDay()); // rewind to Sunday

    const weekDays = [];
    for (let i = 0; i < 7; i++) {
      const d    = new Date(sunday);
      d.setDate(sunday.getDate() + i);
      const y    = d.getFullYear();
      const m    = d.getMonth() + 1;
      const dStr = _isoDate(d);
      const data = await _getMonthData(y, m);
      const dayData = data.days.find(day => day.date === dStr) ||
        { date: dStr, totalTasks: 0, doneTasks: 0, hebrewDay: 0, hebrewMonth: 1, hebrewYear: 5786,
          isToday: false, isShabbat: false, isHoliday: false, isPast: false };
      weekDays.push(dayData);
    }

    // Keep calendarData pointing to a valid settings object
    calendarData = await _getMonthData(currentYear, currentMonth);

    const label = document.getElementById('calMonthLabel');
    if (label) {
      const s = weekDays[0], e = weekDays[6];
      const startHeb = s.hebrewDay
        ? `${HEB_NUMS[s.hebrewDay] || s.hebrewDay} ${HEBREW_MONTH_NAMES[s.hebrewMonth]}`
        : s.date;
      const endHeb = e.hebrewDay
        ? `${HEB_NUMS[e.hebrewDay] || e.hebrewDay} ${HEBREW_MONTH_NAMES[e.hebrewMonth]}`
        : e.date;
      label.innerHTML = `<span>${startHeb} — ${endHeb}</span>`;
    }

    const grid = document.getElementById('calGrid');
    const headerHtml = DOW_HEADERS.map(h => `<div class="cal-header-cell">${h}</div>`).join('');
    grid.innerHTML = headerHtml + weekDays.map(d => _renderDayCell(d)).join('');
    _attachGridClicks(grid);
    _restoreSelection(grid);
    _renderTaskPanel(selectedDate);
  }

  // ── Daily view ────────────────────────────────────────────────────────────

  async function _renderDaily() {
    const [y, m] = selectedDate.split('-').map(Number);
    calendarData = await _getMonthData(y, m);
    const dayData = calendarData.days.find(d => d.date === selectedDate);

    const label = document.getElementById('calMonthLabel');
    if (label) {
      if (dayData?.hebrewDay) {
        const fullHeb =
          `${HEB_NUMS[dayData.hebrewDay]} ב${HEBREW_MONTH_NAMES[dayData.hebrewMonth]} ${_toGematria(dayData.hebrewYear)}`;
        label.innerHTML =
          `<strong>${fullHeb}</strong> <span class="cal-month-sub">(${_formatDateLabel(selectedDate)})</span>`;
      } else {
        label.textContent = _formatDateLabel(selectedDate);
      }
    }

    const taskCount = dayData?.totalTasks || 0;
    const doneCount = dayData?.doneTasks  || 0;
    const colorCls  = dayData ? _colorClass(dayData) : '';
    const statLine  = taskCount > 0
      ? `<div class="cal-day-tasks-summary">${doneCount} / ${taskCount} משימות הושלמו</div>`
      : '<div class="cal-day-tasks-summary">אין משימות</div>';

    const hebLine = dayData?.hebrewDay
      ? `<div class="cal-day-single__heb">${HEB_NUMS[dayData.hebrewDay]} ב${HEBREW_MONTH_NAMES[dayData.hebrewMonth]}</div>`
      : '';

    const grid = document.getElementById('calGrid');
    grid.innerHTML = `
      <div class="cal-day-single ${colorCls}">
        ${hebLine}
        <div class="cal-day-single__greg">${_formatDateLabel(selectedDate)}</div>
        ${statLine}
      </div>`;

    _renderTaskPanel(selectedDate);
  }

  // ── Task panel ────────────────────────────────────────────────────────────

  async function _renderTaskPanel(dateStr) {
    const panel     = document.getElementById('calTaskPanel');
    const dateLabel = document.getElementById('calTaskDate');

    if (!dateStr) {
      dateLabel.textContent = 'בחר יום';
      panel.innerHTML = '<p class="placeholder-text">לחץ על יום בלוח לצפייה במשימות</p>';
      return;
    }

    dateLabel.textContent = _formatDateLabelFull(dateStr);
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
            _monthCache = {}; // clear cache for fresh reload
            loadCalendar();
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
      ? `<span class="task-item__num">חזרה ${task.reviewNumber}</span>` : '';

    const hebDate    = _getHebDateForStr(task.dueDate);
    const hebBadge   = hebDate ? `<span class="task-item__hebdate">${hebDate}</span>` : '';

    return `
      <div class="task-item ${done ? 'task-item--done' : ''}">
        <div class="task-item__info">
          <span class="task-item__type">${_esc(typeLabel)}</span>
          <span class="task-item__title">${_esc(task.title || task.summaryPath)}</span>
          ${revBadge}
          ${hebBadge}
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

  function _isoDate(d) {
    const y  = d.getFullYear();
    const m  = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  function _getHebDateForStr(dateStr) {
    if (!dateStr) return '';
    const [y, m] = dateStr.split('-').map(Number);
    const key    = `${y}-${String(m).padStart(2, '0')}`;
    const cached = _monthCache[key];
    if (!cached) return '';
    const dayData = cached.days.find(d => d.date === dateStr);
    if (!dayData?.hebrewDay) return '';
    return `${HEB_NUMS[dayData.hebrewDay] || dayData.hebrewDay} ב${HEBREW_MONTH_NAMES[dayData.hebrewMonth]} ${_toGematria(dayData.hebrewYear)}`;
  }

  function _formatDateLabel(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dow = new Date(y, m - 1, d).getDay();
    return `יום ${DOW_NAMES_HE[dow]}, ${d} ב${MONTH_NAMES_GREG[m]} ${y}`;
  }

  function _formatDateLabelFull(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dow      = new Date(y, m - 1, d).getDay();
    const gregPart = `יום ${DOW_NAMES_HE[dow]}, ${d} ב${MONTH_NAMES_GREG[m]} ${y}`;
    const hebDate  = _getHebDateForStr(dateStr);
    return hebDate ? `${hebDate} | ${gregPart}` : gregPart;
  }

  function setDisplayPref(pref) {
    _calDisplayPref = pref;
    _monthCache = {}; // clear cache when display pref changes
    loadCalendar();
  }

  // ── Public ────────────────────────────────────────────────────────────────

  return { init, loadCalendar, setDisplayPref };
})();
