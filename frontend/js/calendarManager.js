// מנהל לוח השנה הדו-לשוני ולוח בקרה
const CalendarManager = (() => {

  // ── Parashat Hashavua — procedurally generated for 5776–5807 (2015–2047) ────
  // Key = ISO date of Shabbat (Saturday); value = parasha display name (Israel cycle).
  //
  // Algorithm: for each Hebrew year, the Bereshit Shabbat (first Shabbat after
  // Simchat Torah = 23 Tishrei) is the anchor. Parashiot are assigned in order
  // from index 0 (בראשית). Certain pairs are combined when the year is short.
  // Pesach and Sukkot Chol HaMoed Shabbatot skip regular parasha numbering.

  const _PARASHA_NAMES = [
    'בראשית','נח','לך לך','וירא','חיי שרה','תולדות','ויצא','וישלח','וישב','מקץ',
    'ויגש','ויחי','שמות','וארא','בא','בשלח','יתרו','משפטים','תרומה','תצוה',
    'כי תשא','ויקהל','פקודי','ויקרא','צו','שמיני','תזריע','מצורע','אחרי מות',
    'קדושים','אמור','בהר','בחוקותי','במדבר','נשא','בהעלותך','שלח לך','קורח',
    'חוקת','בלק','פינחס','מטות','מסעי','דברים','ואתחנן','עקב','ראה','שופטים',
    'כי תצא','כי תבוא','ניצבים','וילך','האזינו',
  ];

  // Combination pairs (index of first in pair): applied when year needs fewer Shabbatot
  // non-leap standard: combine ויקהל-פקודי(21-22), תזריע-מצורע(26-27),
  //                    אחרי מות-קדושים(28-29), בהר-בחוקותי(31-32),
  //                    מטות-מסעי(41-42), ניצבים-וילך(50-51)
  // leap year: only ניצבים-וילך may combine depending on year length
  const _COMBO_NONLEAP = new Set([21, 26, 28, 31, 41, 50]);
  const _COMBO_LEAP     = new Set([50]);

  // Bereshit Shabbat anchor dates for Hebrew years 5776–5807
  // = first Shabbat on or after 24 Tishrei (day after Simchat Torah in Israel)
  const _BERESHIT_ANCHORS = {
    5776:'2015-10-10', 5777:'2016-10-29', 5778:'2017-10-14', 5779:'2018-10-06',
    5780:'2019-10-26', 5781:'2020-10-17', 5782:'2021-10-02', 5783:'2022-10-22',
    5784:'2023-10-14', 5785:'2024-10-26', 5786:'2025-10-18', 5787:'2026-10-03',
    5788:'2027-10-23', 5789:'2028-10-14', 5790:'2029-09-29', 5791:'2030-10-19',
    5792:'2031-10-11', 5793:'2032-09-25', 5794:'2033-10-15', 5795:'2034-10-06',
    5796:'2035-10-20', 5797:'2036-10-11', 5798:'2037-09-26', 5799:'2038-10-16',
    5800:'2039-10-08', 5801:'2040-09-22', 5802:'2041-10-12', 5803:'2042-10-04',
    5804:'2043-10-17', 5805:'2044-10-08', 5806:'2045-09-30', 5807:'2046-10-13',
  };

  // Leap years (month 13 exists): mod-19 positions {0,3,6,8,11,14,17}
  function _isHebrewLeap(year) {
    return [0, 3, 6, 8, 11, 14, 17].includes(((year * 7) + 1) % 19);
  }

  // Pesach start dates (15 Nisan) for each Hebrew year (approx Gregorian)
  // used to detect Chol HaMoed Pesach Shabbat (between day 2 and day 8)
  // and Chol HaMoed Sukkot (between 16-21 Tishrei)
  // We store year → Pesach start ISO date
  const _PESACH_START = {
    5776:'2016-04-23', 5777:'2017-04-11', 5778:'2018-03-31', 5779:'2019-04-20',
    5780:'2020-04-09', 5781:'2021-03-28', 5782:'2022-04-16', 5783:'2023-04-06',
    5784:'2024-04-23', 5785:'2025-04-13', 5786:'2026-04-02', 5787:'2027-04-22',
    5788:'2028-04-11', 5789:'2029-04-01', 5790:'2030-04-18', 5791:'2031-04-08',
    5792:'2032-03-28', 5793:'2033-04-14', 5794:'2034-04-04', 5795:'2035-04-24',
    5796:'2036-04-12', 5797:'2037-04-01', 5798:'2038-04-21', 5799:'2039-04-10',
    5800:'2040-03-30', 5801:'2041-04-17', 5802:'2042-04-07', 5803:'2043-03-28',
    5804:'2044-04-14', 5805:'2045-04-04', 5806:'2046-04-23', 5807:'2047-04-13',
  };

  function _addDays(isoDate, n) {
    const d = new Date(isoDate + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function _isoToMs(iso) { return new Date(iso + 'T12:00:00Z').getTime(); }

  function _generateParashaByDate() {
    const result = {};

    for (const [yearStr, bereshitDate] of Object.entries(_BERESHIT_ANCHORS)) {
      const year = parseInt(yearStr, 10);
      const nextYear = year + 1;
      const nextBereshit = _BERESHIT_ANCHORS[nextYear];
      if (!nextBereshit) continue;

      const leap   = _isHebrewLeap(year);
      const combos = leap ? _COMBO_LEAP : _COMBO_NONLEAP;

      // Build the ordered parasha sequence for this year (with combinations)
      const sequence = [];
      for (let i = 0; i < _PARASHA_NAMES.length; i++) {
        if (combos.has(i) && i + 1 < _PARASHA_NAMES.length) {
          sequence.push(_PARASHA_NAMES[i] + '-' + _PARASHA_NAMES[i + 1]);
          i++; // skip next
        } else {
          sequence.push(_PARASHA_NAMES[i]);
        }
      }

      // Pesach window for this year: Shabbat between Pesach day 1 (15 Nisan) and Pesach day 8
      const pesachStart = _PESACH_START[year];
      const pesachEnd   = pesachStart ? _addDays(pesachStart, 7) : null;

      // Sukkot: Rosh Hashana of next Hebrew year → Sukkot starts 14 days later (15 Tishrei)
      // We approximate: 14 days before next Bereshit anchor ≈ Shemini Atzeret,
      // so Sukkot Chol HaMoed Shabbat ≈ 7–12 days before Shemini Atzeret
      // i.e. 2–7 days before nextBereshit (nextBereshit is first Shabbat after 23 Tishrei)
      // Simpler: Sukkot starts ~14 days before nextBereshit-anchor
      // Chol HaMoed Sukkot Shabbat = between 16 and 21 Tishrei = between nextBereshit-9 and nextBereshit-4
      const sukkotShabbat = (() => {
        const nb = _isoToMs(nextBereshit);
        for (let d = -9; d <= -4; d++) {
          const candidate = _addDays(nextBereshit, d);
          const dow = new Date(candidate + 'T12:00:00Z').getUTCDay();
          if (dow === 6) return candidate;
        }
        return null;
      })();

      // Assign parashiot to each Shabbat from bereshit to day before next bereshit
      let shabbat = bereshitDate;
      let seqIdx = 0;

      while (_isoToMs(shabbat) < _isoToMs(nextBereshit)) {
        const dow = new Date(shabbat + 'T12:00:00Z').getUTCDay();
        if (dow !== 6) { shabbat = _addDays(shabbat, 1); continue; }

        // Check Pesach Chol HaMoed
        if (pesachStart && pesachEnd) {
          const ms = _isoToMs(shabbat);
          const p1 = _isoToMs(pesachStart);
          const p8 = _isoToMs(pesachEnd);
          if (ms >= p1 && ms <= p8) {
            result[shabbat] = 'חוה"מ פסח';
            shabbat = _addDays(shabbat, 7);
            continue;
          }
        }

        // Check Sukkot Chol HaMoed
        if (sukkotShabbat && shabbat === sukkotShabbat) {
          result[shabbat] = 'חוה"מ סוכות';
          shabbat = _addDays(shabbat, 7);
          continue;
        }

        // Regular parasha
        if (seqIdx < sequence.length) {
          result[shabbat] = sequence[seqIdx++];
        }
        shabbat = _addDays(shabbat, 7);
      }
    }

    return result;
  }

  const _PARASHA_BY_DATE = _generateParashaByDate();

  // ── Holiday names lookup (Hebrew month:day → display name) ───────────────
  // Covers work-prohibited days AND Chol HaMoed (notable but not blocked).
  const _HOLIDAY_NAMES = {
    // תשרי — Tishrei
    '7:1':  'ראש השנה',    '7:2':  'ראש השנה',
    '7:3':  'צום גדליה',
    '7:10': 'יום כיפור',
    '7:15': 'סוכות',       '7:16': 'חוה"מ סוכות',
    '7:17': 'חוה"מ סוכות', '7:18': 'חוה"מ סוכות',
    '7:19': 'חוה"מ סוכות', '7:20': 'חוה"מ סוכות',
    '7:21': 'הושענה רבה',  '7:22': 'שמחת תורה',  '7:23': 'שמחת תורה',
    // כסלו / טבת — Kislev / Tevet (Chanukah spans 8 days: 25 Kislev – 2/3 Tevet)
    '9:25': 'חנוכה',  '9:26': 'חנוכה',  '9:27': 'חנוכה',
    '9:28': 'חנוכה',  '9:29': 'חנוכה',  '9:30': 'חנוכה',
    '10:1': 'חנוכה',  '10:2': 'חנוכה',  '10:3': 'חנוכה',
    // טבת — Tevet
    '10:10': 'עשרה בטבת',
    // שבט — Shvat
    '11:15': 'ט"ו בשבט',
    // אדר / אדר א׳ — Adar (in leap year, Purim is in Adar Bet = month 13)
    '12:13': 'תענית אסתר', '12:14': 'פורים',       '12:15': 'שושן פורים',
    // אדר ב׳ — Adar Bet (leap year)
    '13:13': 'תענית אסתר', '13:14': 'פורים',        '13:15': 'שושן פורים',
    // ניסן — Nisan
    '1:14': 'ערב פסח',
    '1:15': 'פסח',         '1:16': 'חוה"מ פסח',
    '1:17': 'חוה"מ פסח',   '1:18': 'חוה"מ פסח',
    '1:19': 'חוה"מ פסח',   '1:20': 'חוה"מ פסח',
    '1:21': 'פסח',         '1:22': 'פסח',
    // סיוון — Sivan
    '3:6':  'שבועות',      '3:7':  'שבועות',
    // תמוז — Tammuz
    '4:17': 'י"ז בתמוז',
    // אב — Av
    '5:9':  'תשעה באב',
  };

  function _getHolidayName(day) {
    return _HOLIDAY_NAMES[`${day.hebrewMonth}:${day.hebrewDay}`] || '';
  }

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
        // Anchor selectedDate to mid-month so _renderHebrewMonthGrid finds correct ref
        selectedDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-15`;
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
        // Anchor selectedDate to mid-month so _renderHebrewMonthGrid finds correct ref
        selectedDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-15`;
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
      // Double-click → quick event entry
      cell.addEventListener('dblclick', () => {
        if (cell.classList.contains('cal-cell--blocked')) return;
        _openQuickEventModal(cell.dataset.date);
      });
    });
  }

  function _openQuickEventModal(dateStr) {
    const modal = document.getElementById('quickEventModal');
    if (!modal) return;
    document.getElementById('quickEventDate').textContent = dateStr;
    document.getElementById('quickEventInput').value = '';
    modal.classList.remove('hidden');
    document.getElementById('quickEventInput').focus();

    // wire confirm once (remove old listeners via clone)
    const confirmBtn = document.getElementById('quickEventConfirmBtn');
    const newConfirm = confirmBtn.cloneNode(true);
    confirmBtn.replaceWith(newConfirm);
    newConfirm.addEventListener('click', async () => {
      const title = document.getElementById('quickEventInput').value.trim();
      if (!title) return;
      try {
        newConfirm.disabled = true;
        await Api.addCalendarEvent(dateStr, title);
        _monthCache = {};
        modal.classList.add('hidden');
        loadCalendar();
      } catch (err) {
        newConfirm.disabled = false;
        alert(`שגיאה: ${err.message}`);
      }
    });

    const cancelBtn = document.getElementById('quickEventCancelBtn');
    const newCancel = cancelBtn.cloneNode(true);
    cancelBtn.replaceWith(newCancel);
    newCancel.addEventListener('click', () => modal.classList.add('hidden'));
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
    const holidayName = _getHolidayName(day);
    const holidayHtml = holidayName
      ? `<span class="cal-cell__holiday" title="${holidayName}">${holidayName}</span>`
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
        ${holidayHtml}${parashaHtml}
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
      ${holidayHtml}${parashaHtml}
    </div>`;
  }

  function _colorClass(day) {
    if (day.isShabbat || day.isHoliday) return '';
    const thr = calendarData?.settings?.heavyLoadThreshold ?? 9;
    if (day.isPast || day.isToday) {
      if (day.totalTasks === 0) return '';
      const pct = day.doneTasks / day.totalTasks;
      if (pct >= 1)    return 'cal-cell--done';
      if (pct >= 0.01) return 'cal-cell--partial';
      return 'cal-cell--missed';
    }
    // Future days
    const n = day.totalTasks;
    if (n === 0)            return 'cal-cell--load-0';
    // All future tasks already completed → solid green
    if (n > 0 && day.doneTasks >= n) return 'cal-cell--done';
    // Load-based heatmap: 0–50% of threshold = yellow, >50% = brown
    const half = Math.ceil(thr / 2);
    if (n <= half) return 'cal-cell--load-low';
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

      // ── Complete ──
      panel.querySelectorAll('.task-done-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          try {
            btn.disabled = true;
            await Api.completeTask(btn.dataset.id, 3);
            _monthCache = {};
            loadCalendar();
          } catch (err) { btn.disabled = false; alert(`שגיאה: ${err.message}`); }
        });
      });

      // ── Undo complete ──
      panel.querySelectorAll('.task-undo-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          try {
            btn.disabled = true;
            await Api.uncompleteTask(btn.dataset.id);
            _monthCache = {};
            loadCalendar();
          } catch (err) { btn.disabled = false; alert(`שגיאה: ${err.message}`); }
        });
      });

      // ── Postpone (+1 day cascade) ──
      panel.querySelectorAll('.task-postpone-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          try {
            btn.disabled = true;
            await Api.postponeTask(btn.dataset.id);
            _monthCache = {};
            loadCalendar();
          } catch (err) { btn.disabled = false; alert(`שגיאה: ${err.message}`); }
        });
      });

      // ── Learned yesterday (−1 day cascade) ──
      panel.querySelectorAll('.task-yesterday-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          try {
            btn.disabled = true;
            await Api.learnYesterday(btn.dataset.id);
            _monthCache = {};
            loadCalendar();
          } catch (err) { btn.disabled = false; alert(`שגיאה: ${err.message}`); }
        });
      });
    } catch (err) {
      panel.innerHTML =
        `<p class="placeholder-text error-text">שגיאה: ${_esc(err.message)}</p>`;
    }
  }

  function _renderTaskItem(task) {
    const TYPE_LABEL = { completion: 'לימוד', review: 'חזרה', quiz: 'חידון', study: 'תרגול', event: 'אירוע', 'learning-plan': 'מסלול' };
    const typeLabel  = TYPE_LABEL[task.type] || task.type;
    const done       = task.completed;
    const revBadge   = task.reviewNumber
      ? `<span class="task-item__num">חזרה ${task.reviewNumber}</span>` : '';
    const hebDate    = _getHebDateForStr(task.dueDate);
    const hebBadge   = hebDate ? `<span class="task-item__hebdate">${hebDate}</span>` : '';

    const actions = done
      ? `<span class="task-item__status">✓ הושלם</span>
         <button class="btn btn--xs btn--ghost task-undo-btn" data-id="${_esc(task.id)}" title="בטל השלמה">↩</button>`
      : `<button class="btn btn--xs btn--primary task-done-btn" data-id="${_esc(task.id)}">סיימתי ✓</button>
         <button class="btn btn--xs btn--ghost task-postpone-btn" data-id="${_esc(task.id)}" title="דחה יום קדימה">דחה ←</button>
         <button class="btn btn--xs btn--ghost task-yesterday-btn" data-id="${_esc(task.id)}" title="למדתי את זה אתמול">אתמול</button>`;

    return `
      <div class="task-item ${done ? 'task-item--done' : ''}">
        <div class="task-item__info">
          <span class="task-item__type">${_esc(typeLabel)}</span>
          <span class="task-item__title">${_esc(task.title || task.summaryPath)}</span>
          ${revBadge}${hebBadge}
        </div>
        <div class="task-item__actions">${actions}</div>
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
