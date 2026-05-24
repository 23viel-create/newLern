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

  // Leap years (month 13 exists): standard Metonic formula — matches backend srController.js
  function _isHebrewLeap(year) {
    return ((7 * year + 1) % 19) < 7;
  }

  // ── Deterministic Hebrew ↔ Gregorian conversion ─────────────────────────────
  // Mirrors backend/controllers/srController.js so navigation jumps directly to
  // an absolute coordinate (Year, Month, Day=1) — zero cumulative drift.

  const _HEB_EPOCH = 347997;

  function _hebCalcElapsed(y) {
    const months = Math.floor((235 * y - 234) / 19);
    const parts  = 12084 + 13753 * months;
    let   day    = months * 29 + Math.floor(parts / 25920);
    if ((3 * (day + 1)) % 7 < 3) day++;
    return day;
  }

  function _hebYearStart(y) {
    const elapsed  = _hebCalcElapsed(y);
    const elapsed0 = _hebCalcElapsed(y - 1);
    const elapsed2 = _hebCalcElapsed(y + 1);
    let   rosh     = elapsed + 1;
    if ((elapsed - elapsed0) === 356)       rosh += 2;
    else if ((elapsed2 - elapsed) === 382)  rosh += 1;
    return _HEB_EPOCH + rosh;
  }

  function _hebMonthLen(y, m) {
    const yl = _hebYearStart(y + 1) - _hebYearStart(y);
    switch (m) {
      case 1:  return 30; case 2:  return 29; case 3: return 30;
      case 4:  return 29; case 5:  return 30; case 6: return 29;
      case 7:  return 30;
      case 8:  return (yl % 10 === 5) ? 30 : 29;
      case 9:  return (yl % 10 === 3) ? 29 : 30;
      case 10: return 29; case 11: return 30;
      case 12: return _isHebrewLeap(y) ? 30 : 29;
      case 13: return 29;
      default: return 30;
    }
  }

  function _hebToJdn(y, m, d) {
    const numM = _isHebrewLeap(y) ? 13 : 12;
    let jdn = _hebYearStart(y) + d - 1;
    if (m >= 7) {
      for (let i = 7; i < m; i++) jdn += _hebMonthLen(y, i);
    } else {
      for (let i = 7; i <= numM; i++) jdn += _hebMonthLen(y, i);
      for (let i = 1; i <  m;   i++) jdn += _hebMonthLen(y, i);
    }
    return jdn;
  }

  function _jdnToGregorian(jdn) {
    const a  = jdn + 32044;
    const b  = Math.floor((4 * a + 3) / 146097);
    const c  = a - Math.floor(146097 * b / 4);
    const d0 = Math.floor((4 * c + 3) / 1461);
    const e  = c - Math.floor(1461 * d0 / 4);
    const mm = Math.floor((5 * e + 2) / 153);
    return {
      year:  100 * b + d0 - 4800 + Math.floor(mm / 10),
      month: mm + 3 - 12 * Math.floor(mm / 10),
      day:   e - Math.floor((153 * mm + 2) / 5) + 1,
    };
  }

  /** Convert absolute Hebrew (year, month, day) → Gregorian {year, month, day}. */
  function _hebToGregorian(y, m, d) {
    return _jdnToGregorian(_hebToJdn(y, m, d));
  }

  // Month traversal order inside a Hebrew year (Tishrei … Elul)
  const _HEB_ORDER_LEAP    = [7, 8, 9, 10, 11, 12, 13, 1, 2, 3, 4, 5, 6];
  const _HEB_ORDER_NONLEAP = [7, 8, 9, 10, 11, 12,     1, 2, 3, 4, 5, 6];

  function _nextHebYearMonth(y, m) {
    const ord = _isHebrewLeap(y) ? _HEB_ORDER_LEAP : _HEB_ORDER_NONLEAP;
    const idx = ord.indexOf(m);
    if (idx === ord.length - 1) return { year: y + 1, month: 7 }; // Elul → next Tishrei
    return { year: y, month: ord[idx + 1] };
  }

  function _prevHebYearMonth(y, m) {
    if (m === 7) return { year: y - 1, month: 6 };                  // Tishrei → prev Elul
    const ord = _isHebrewLeap(y) ? _HEB_ORDER_LEAP : _HEB_ORDER_NONLEAP;
    const idx = ord.indexOf(m);
    return { year: y, month: ord[Math.max(0, idx - 1)] };
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

  // In a leap year month 12 = Adar I (אדר א׳); all other months are year-independent
  function _hebrewMonthName(month, year) {
    if (month === 12 && _isHebrewLeap(year)) return 'אדר א׳';
    return HEBREW_MONTH_NAMES[month] || `חודש ${month}`;
  }

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
        if (_calDisplayPref === 'hebrew') {
          // Declarative coordinate mapping: resolve current Hebrew year+month,
          // step to the previous month token (handles 13-month leap years),
          // clamp to day 1, convert back to an exact Gregorian anchor — no drift.
          let refDay = calendarData?.days.find(d => d.date === selectedDate);
          if (!refDay && calendarData?.days.length)
            refDay = calendarData.days[Math.floor(calendarData.days.length / 2)];
          if (refDay) {
            const targ = _prevHebYearMonth(refDay.hebrewYear, refDay.hebrewMonth);
            const greg = _hebToGregorian(targ.year, targ.month, 1);
            currentYear  = greg.year;
            currentMonth = greg.month;
            selectedDate = `${greg.year}-${String(greg.month).padStart(2, '0')}-${String(greg.day).padStart(2, '0')}`;
          } else {
            currentMonth--;
            if (currentMonth < 1) { currentMonth = 12; currentYear--; }
            selectedDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-15`;
          }
        } else {
          currentMonth--;
          if (currentMonth < 1) { currentMonth = 12; currentYear--; }
          selectedDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-15`;
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
          // Declarative: same approach as prev, stepping forward one Hebrew month.
          let refDay = calendarData?.days.find(d => d.date === selectedDate);
          if (!refDay && calendarData?.days.length)
            refDay = calendarData.days[Math.floor(calendarData.days.length / 2)];
          if (refDay) {
            const targ = _nextHebYearMonth(refDay.hebrewYear, refDay.hebrewMonth);
            const greg = _hebToGregorian(targ.year, targ.month, 1);
            currentYear  = greg.year;
            currentMonth = greg.month;
            selectedDate = `${greg.year}-${String(greg.month).padStart(2, '0')}-${String(greg.day).padStart(2, '0')}`;
          } else {
            currentMonth++;
            if (currentMonth > 12) { currentMonth = 1; currentYear++; }
            selectedDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-15`;
          }
        } else {
          currentMonth++;
          if (currentMonth > 12) { currentMonth = 1; currentYear++; }
          selectedDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-15`;
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

    // View toggle buttons (חודשי / שבועי / יומי)
    document.querySelectorAll('.cal-view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        _viewMode = btn.dataset.view;
        document.querySelectorAll('.cal-view-btn').forEach(b =>
          b.classList.toggle('cal-view-btn--active', b === btn));
        loadCalendar();
      });
    });

    // Month/Year picker initialisation (must run after DOM is ready)
    _initPickers();

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

  // ── Month/Year quick-picker ───────────────────────────────────────────────

  function _initPickers() {
    const monthSel = document.getElementById('calMonthPicker');
    const yearSel  = document.getElementById('calYearPicker');
    if (!monthSel || !yearSel) return;

    // Gregorian month names (Hebrew locale), index 1–12
    MONTH_NAMES_GREG.forEach((name, i) => {
      if (i === 0) return;
      const opt = document.createElement('option');
      opt.value       = i;
      opt.textContent = name;
      monthSel.appendChild(opt);
    });

    // Year range: today-3 … today+7, extended dynamically by _syncPickers
    const base = new Date().getFullYear();
    for (let y = base - 3; y <= base + 7; y++) {
      const opt = document.createElement('option');
      opt.value = opt.textContent = y;
      yearSel.appendChild(opt);
    }

    // Jump on change
    function _onPickerChange() {
      currentMonth = +monthSel.value;
      currentYear  = +yearSel.value;
      selectedDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
      _monthCache  = {};
      loadCalendar();
    }
    monthSel.addEventListener('change', _onPickerChange);
    yearSel.addEventListener('change',  _onPickerChange);

    _syncPickers();
  }

  /** Keep the month/year dropdowns in sync with the active view state. */
  function _syncPickers() {
    const monthSel = document.getElementById('calMonthPicker');
    const yearSel  = document.getElementById('calYearPicker');
    if (!monthSel || !yearSel) return;

    monthSel.value = String(currentMonth);

    // Extend year list if the user navigated outside the initial range
    if (yearSel.options.length) {
      while (+yearSel.options[0].value > currentYear) {
        const opt = document.createElement('option');
        opt.value = opt.textContent = String(+yearSel.options[0].value - 1);
        yearSel.insertBefore(opt, yearSel.firstChild);
      }
      while (+yearSel.options[yearSel.options.length - 1].value < currentYear) {
        const opt = document.createElement('option');
        opt.value = opt.textContent = String(+yearSel.options[yearSel.options.length - 1].value + 1);
        yearSel.appendChild(opt);
      }
    }
    yearSel.value = String(currentYear);
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

  function _updateLegend() {
    const N    = calendarData?.settings?.heavyLoadThreshold ?? 9;
    const half = Math.floor(N / 2);
    const lowEl   = document.getElementById('legendLoadLow');
    const highEl  = document.getElementById('legendLoadHigh');
    const blackEl = document.getElementById('legendLoadBlack');
    if (lowEl)   lowEl.textContent   = `צהוב — 1–${half}`;
    if (highEl)  highEl.textContent  = `חום — ${half + 1}–${N - 1}`;
    if (blackEl) blackEl.textContent = `שחור — ${N}+`;
  }

  async function loadCalendar() {
    _syncPickers();           // keep month/year dropdowns in sync with view state
    const grid = document.getElementById('calGrid');
    try {
      calendarData = await _getMonthData(currentYear, currentMonth);
      _calDisplayPref = calendarData?.settings?.calendarDisplayPreference || 'combined';
      _updateDispToggle();
      _updateLegend();

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
      const hebName = _hebrewMonthName(hebM, hebY);
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
      const firstName  = _hebrewMonthName(first.month, first.year);
      const secondName = _hebrewMonthName(second.month, second.year);
      // Use the year of the predominant (later) month
      const hebYear = _toGematria(second.year);
      hebLabel = `${firstName} - ${secondName} ${hebYear}`;
    } else if (hebMonthsSeen.length === 1) {
      const m = hebMonthsSeen[0];
      hebLabel = `${_hebrewMonthName(m.month, m.year)} ${_toGematria(m.year)}`;
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
        selectedDate = cell.dataset.date;
        grid.querySelectorAll('.cal-cell--selected')
            .forEach(c => c.classList.remove('cal-cell--selected'));
        cell.classList.add('cal-cell--selected');
        _renderTaskPanel(selectedDate);
      });
      // Double-click → quick event entry
      cell.addEventListener('dblclick', () => {
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
    const N = calendarData?.settings?.heavyLoadThreshold ?? 9;
    const n = day.totalTasks;

    if (day.isPast || day.isToday) {
      if (n === 0) return '';
      const pct = day.doneTasks / n;
      if (pct >= 1)    return 'cal-cell--done';
      if (pct >= 0.01) return 'cal-cell--partial';
      return 'cal-cell--missed';
    }

    // Future days — strict 4-tier heatmap
    if (n === 0) return 'cal-cell--load-0';
    if (day.doneTasks >= n) return 'cal-cell--done';   // all done → green
    if (n >= N)             return 'cal-cell--load-black'; // ≥ MaxLoad → black
    if (n > N / 2)          return 'cal-cell--load-high';  // 50%–100% → brown
    return 'cal-cell--load-low';                           // 1–50% → yellow
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
        ? `${HEB_NUMS[s.hebrewDay] || s.hebrewDay} ${_hebrewMonthName(s.hebrewMonth, s.hebrewYear)}`
        : s.date;
      const endHeb = e.hebrewDay
        ? `${HEB_NUMS[e.hebrewDay] || e.hebrewDay} ${_hebrewMonthName(e.hebrewMonth, e.hebrewYear)}`
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
          `${HEB_NUMS[dayData.hebrewDay]} ב${_hebrewMonthName(dayData.hebrewMonth, dayData.hebrewYear)} ${_toGematria(dayData.hebrewYear)}`;
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
      ? `<div class="cal-day-single__heb">${HEB_NUMS[dayData.hebrewDay]} ב${_hebrewMonthName(dayData.hebrewMonth, dayData.hebrewYear)}</div>`
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
    // Load notes for the selected day
    if (typeof NotesManager !== 'undefined') NotesManager.renderForDate(dateStr);
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
          const snapYear = currentYear, snapMonth = currentMonth, snapDate = selectedDate;
          try {
            btn.disabled = true;
            await Api.completeTask(btn.dataset.id, 3);
            currentYear = snapYear; currentMonth = snapMonth; selectedDate = snapDate;
            _monthCache = {};
            loadCalendar();
          } catch (err) { btn.disabled = false; alert(`שגיאה: ${err.message}`); }
        });
      });

      // ── Undo complete ──
      panel.querySelectorAll('.task-undo-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const snapYear = currentYear, snapMonth = currentMonth, snapDate = selectedDate;
          try {
            btn.disabled = true;
            await Api.uncompleteTask(btn.dataset.id);
            currentYear = snapYear; currentMonth = snapMonth; selectedDate = snapDate;
            _monthCache = {};
            loadCalendar();
          } catch (err) { btn.disabled = false; alert(`שגיאה: ${err.message}`); }
        });
      });

      // ── Postpone (+1 day cascade) ──
      panel.querySelectorAll('.task-postpone-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const snapYear = currentYear, snapMonth = currentMonth, snapDate = selectedDate;
          try {
            btn.disabled = true;
            await Api.postponeTask(btn.dataset.id);
            currentYear = snapYear; currentMonth = snapMonth; selectedDate = snapDate;
            _monthCache = {};
            loadCalendar();
          } catch (err) { btn.disabled = false; alert(`שגיאה: ${err.message}`); }
        });
      });

      // ── "סיימתי עד לכאן היום" — cascade −1 day with irreversible-action warning ──
      panel.querySelectorAll('.task-yesterday-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const confirmed = await WindowManager.confirm(
            'האם אתה בטוח? כל המשימות הבאות שקשורות לרצף לימוד זה יידחו למחר, וימשיכו ישירות לאחר הלימוד הנוכחי שסיימת. פעולה זו אינה הפיכה.'
          );
          if (!confirmed) return;
          const snapYear = currentYear, snapMonth = currentMonth, snapDate = selectedDate;
          try {
            btn.disabled = true;
            await Api.learnYesterday(btn.dataset.id);
            currentYear = snapYear; currentMonth = snapMonth; selectedDate = snapDate;
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
         <button class="btn btn--xs btn--ghost task-yesterday-btn" data-id="${_esc(task.id)}" title="סיימתי עד לכאן היום — כל המשימות הבאות ידחו">סיימתי עד לכאן היום</button>`;

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
    return `${HEB_NUMS[dayData.hebrewDay] || dayData.hebrewDay} ב${_hebrewMonthName(dayData.hebrewMonth, dayData.hebrewYear)} ${_toGematria(dayData.hebrewYear)}`;
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
