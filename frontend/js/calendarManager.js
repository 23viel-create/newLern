// מנהל לוח השנה הדו-לשוני ולוח בקרה
const CalendarManager = (() => {

  // ── Parashat Hashavua lookup (Israel cycle, 5785–5787) ────────────────────
  // Key = ISO date of Shabbat; value = parasha display name.
  // Special non-regular Shabbatot (Chol HaMoed etc.) use descriptive label.
  const _PARASHA_BY_DATE = {
    // ── 5785 (2024–2025) ──
    '2024-10-26':'בראשית',   '2024-11-02':'נח',          '2024-11-09':'לך לך',
    '2024-11-16':'וירא',     '2024-11-23':'חיי שרה',      '2024-11-30':'תולדות',
    '2024-12-07':'ויצא',     '2024-12-14':'וישלח',        '2024-12-21':'וישב',
    '2024-12-28':'מקץ',      '2025-01-04':'ויגש',         '2025-01-11':'ויחי',
    '2025-01-18':'שמות',     '2025-01-25':'וארא',         '2025-02-01':'בא',
    '2025-02-08':'בשלח',     '2025-02-15':'יתרו',         '2025-02-22':'משפטים',
    '2025-03-01':'תרומה',    '2025-03-08':'תצוה',         '2025-03-15':'כי תשא',
    '2025-03-22':'ויקהל-פקודי','2025-03-29':'ויקרא',      '2025-04-05':'צו',
    '2025-04-12':'שמיני',    // Shabbat HaGadol — regular parasha
    // Apr 19 = 7th day Pesach (special, no regular parasha)
    '2025-04-26':'תזריע-מצורע','2025-05-03':'אחרי מות-קדושים','2025-05-10':'אמור',
    '2025-05-17':'בהר',      '2025-05-24':'בחוקותי',      '2025-05-31':'במדבר',
    '2025-06-07':'נשא',      '2025-06-14':'בהעלותך',      '2025-06-21':'שלח לך',
    '2025-06-28':'קורח',     '2025-07-05':'חוקת',         '2025-07-12':'בלק',
    '2025-07-19':'פינחס',    '2025-07-26':'מטות-מסעי',    '2025-08-02':'דברים',
    '2025-08-09':'ואתחנן',   '2025-08-16':'עקב',          '2025-08-23':'ראה',
    '2025-08-30':'שופטים',   '2025-09-06':'כי תצא',       '2025-09-13':'כי תבוא',
    '2025-09-20':'ניצבים-וילך',

    // ── 5786 (2025–2026) ──
    '2025-10-18':'בראשית',   '2025-10-25':'נח',           '2025-11-01':'לך לך',
    '2025-11-08':'וירא',     '2025-11-15':'חיי שרה',      '2025-11-22':'תולדות',
    '2025-11-29':'ויצא',     '2025-12-06':'וישלח',        '2025-12-13':'וישב',
    '2025-12-20':'מקץ',      '2025-12-27':'ויגש',         '2026-01-03':'ויחי',
    '2026-01-10':'שמות',     '2026-01-17':'וארא',         '2026-01-24':'בא',
    '2026-01-31':'בשלח',     '2026-02-07':'יתרו',         '2026-02-14':'משפטים',
    '2026-02-21':'תרומה',    '2026-02-28':'תצוה',         '2026-03-07':'כי תשא',
    '2026-03-14':'ויקהל-פקודי','2026-03-21':'ויקרא',      '2026-03-28':'צו',
    '2026-04-04':'חוה"מ פסח', // Shabbat Chol HaMoed Pesach
    '2026-04-11':'שמיני',    '2026-04-18':'תזריע-מצורע',  '2026-04-25':'אחרי מות-קדושים',
    '2026-05-02':'אמור',     '2026-05-09':'בהר-בחוקותי',  '2026-05-16':'במדבר',
    '2026-05-23':'נשא',      '2026-05-30':'בהעלותך',      '2026-06-06':'שלח לך',
    '2026-06-13':'קורח',     '2026-06-20':'חוקת',         '2026-06-27':'בלק',
    '2026-07-04':'פינחס',    '2026-07-11':'מטות-מסעי',    '2026-07-18':'דברים',
    '2026-07-25':'ואתחנן',   '2026-08-01':'עקב',          '2026-08-08':'ראה',
    '2026-08-15':'שופטים',   '2026-08-22':'כי תצא',       '2026-08-29':'כי תבוא',
    '2026-09-05':'ניצבים',   '2026-09-12':'וילך',         // Shabbat Shuvah
    '2026-09-26':'חוה"מ סוכות', // Shabbat Chol HaMoed Sukkot

    // ── 5787 (2026–2027) ──
    '2026-10-10':'בראשית',   '2026-10-17':'נח',           '2026-10-24':'לך לך',
    '2026-10-31':'וירא',     '2026-11-07':'חיי שרה',      '2026-11-14':'תולדות',
    '2026-11-21':'ויצא',     '2026-11-28':'וישלח',        '2026-12-05':'וישב',
    '2026-12-12':'מקץ',      '2026-12-19':'ויגש',         '2026-12-26':'ויחי',
  };

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
        // RIGHT arrow (❯, calPrevMonth) = go to past = decrement one Gregorian month
        currentMonth--;
        if (currentMonth < 1) { currentMonth = 12; currentYear--; }
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
        // LEFT arrow (❮, calNextMonth) = go to future = increment one Gregorian month
        currentMonth++;
        if (currentMonth > 12) { currentMonth = 1; currentYear++; }
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

    // View toggle buttons (חודשי / שבועי / יומי)
    document.querySelectorAll('.cal-view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        _viewMode = btn.dataset.view;
        document.querySelectorAll('.cal-view-btn').forEach(b =>
          b.classList.toggle('cal-view-btn--active', b === btn));
        loadCalendar();
      });
    });

    // Display preference toggle (עברי / לועזי)
    document.querySelectorAll('.cal-disp-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pref = btn.dataset.pref;
        _calDisplayPref = pref;
        _monthCache = {};
        _updateDispToggle();
        loadCalendar();
        try { await Api.saveScheduleSettings({ calendarDisplayPreference: pref }); } catch {}
      });
    });
  }

  function _updateDispToggle() {
    document.querySelectorAll('.cal-disp-btn').forEach(btn =>
      btn.classList.toggle('cal-disp-btn--active', btn.dataset.pref === _calDisplayPref));
  }

  // Hebrew month navigation: find the boundary of the current Hebrew month,
  // step ±1 day to land in the adjacent Hebrew month, update currentYear/Month.
  // Guard: if the step lands back in the same Gregorian month (Hebrew month
  // extends past the displayed midpoint), advance one additional Gregorian month.
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

    const origYear  = currentYear;
    const origMonth = currentMonth;

    if (direction > 0) {
      // Find last visible day of this Hebrew month, step forward 1 day
      const inMonth = calendarData.days.filter(d => d.hebrewYear === hebY && d.hebrewMonth === hebM);
      if (inMonth.length) {
        const lastDate = new Date(inMonth[inMonth.length - 1].date + 'T12:00:00');
        lastDate.setDate(lastDate.getDate() + 1);
        currentYear  = lastDate.getFullYear();
        currentMonth = lastDate.getMonth() + 1;
        // If still in same Gregorian month, the Hebrew month extends further — advance one more
        if (currentYear === origYear && currentMonth === origMonth) {
          currentMonth++;
          if (currentMonth > 12) { currentMonth = 1; currentYear++; }
        }
        return;
      }
    } else {
      // Find first visible day of this Hebrew month, step back 1 day
      const firstEntry = calendarData.days.find(d => d.hebrewYear === hebY && d.hebrewMonth === hebM);
      if (firstEntry) {
        const firstDate = new Date(firstEntry.date + 'T12:00:00');
        firstDate.setDate(firstDate.getDate() - 1);
        currentYear  = firstDate.getFullYear();
        currentMonth = firstDate.getMonth() + 1;
        // If still in same Gregorian month, the Hebrew month starts before midpoint — go one more back
        if (currentYear === origYear && currentMonth === origMonth) {
          currentMonth--;
          if (currentMonth < 1) { currentMonth = 12; currentYear--; }
        }
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
      _updateDispToggle();

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
    // Use selectedDate's Hebrew month as the reference (fixes mid-month skipping).
    // Fallback to array midpoint only if selectedDate isn't in the data.
    let refDay = calendarData.days.find(d => d.date === selectedDate);
    if (!refDay) refDay = calendarData.days[Math.floor(calendarData.days.length / 2)];
    const hebY   = refDay.hebrewYear;
    const hebM   = refDay.hebrewMonth;

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

    const days = calendarData?.days || [];
    const gregLabel = `${MONTH_NAMES_GREG[currentMonth]} ${currentYear}`;

    // Collect unique Hebrew months across all days of this Gregorian month
    const hebMonthsSeen = [];
    const seenKeys = new Set();
    for (const d of days) {
      const key = `${d.hebrewYear}:${d.hebrewMonth}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        hebMonthsSeen.push({ month: d.hebrewMonth, year: d.hebrewYear });
      }
    }

    let hebLabel = '';
    if (hebMonthsSeen.length >= 2) {
      // Two Hebrew months span this Gregorian month — concatenate names
      const first  = hebMonthsSeen[0];
      const second = hebMonthsSeen[hebMonthsSeen.length - 1];
      const firstName  = HEBREW_MONTH_NAMES[first.month]  || `חודש ${first.month}`;
      const secondName = HEBREW_MONTH_NAMES[second.month] || `חודש ${second.month}`;
      // Use the year of the predominant (later) month
      const hebYear = _toGematria(second.year);
      hebLabel = `${firstName} - ${secondName} ${hebYear}`;
    } else if (hebMonthsSeen.length === 1) {
      const m = hebMonthsSeen[0];
      hebLabel = `${HEBREW_MONTH_NAMES[m.month] || `חודש ${m.month}`} ${_toGematria(m.year)}`;
    }

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

    const gregDay     = Number(day.date.split('-')[2]);
    const badge       = day.totalTasks > 0 ? `<span class="cal-badge">${day.totalTasks}</span>` : '';
    const isRoshChodesh    = day.hebrewDay === 1;        // first of Hebrew month
    const isGregMonthStart = gregDay === 1;              // first of Gregorian month

    const hebDayStr = HEB_NUMS[day.hebrewDay] || String(day.hebrewDay);
    const parasha   = day.isShabbat ? (_PARASHA_BY_DATE[day.date] || '') : '';
    const parashaHtml = parasha
      ? `<span class="cal-cell__parasha" title="פרשת ${parasha}">פ׳ ${parasha}</span>`
      : '';

    if (hebPrimary || _calDisplayPref === 'hebrew') {
      // Hebrew-primary: bold Gregorian "1" on start of Gregorian month
      const gregSpan = isGregMonthStart
        ? `<strong class="cal-cell__greg cal-cell__greg--sub cal-cell__greg--monthstart">1</strong>`
        : `<span class="cal-cell__greg cal-cell__greg--sub">${gregDay}</span>`;
      return `<div class="${classes}" data-date="${day.date}">
        ${badge}
        <span class="cal-cell__heb cal-cell__heb--primary">${hebDayStr}</span>
        ${gregSpan}
        ${parashaHtml}
      </div>`;
    }
    // Gregorian-primary: bold "א׳" on Rosh Chodesh
    const hebSpan = isRoshChodesh
      ? `<strong class="cal-cell__heb cal-cell__heb--rosh-chodesh">א׳</strong>`
      : `<span class="cal-cell__heb">${hebDayStr}</span>`;
    return `<div class="${classes}" data-date="${day.date}">
      ${badge}
      <span class="cal-cell__greg">${gregDay}</span>
      ${hebSpan}
      ${parashaHtml}
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
