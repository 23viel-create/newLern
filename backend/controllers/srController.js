'use strict';
const fs   = require('fs');
const path = require('path');
const { SCHEDULE_FILE } = require('../config/limits');

const scheduleFile = path.resolve(__dirname, SCHEDULE_FILE);

// ── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  algorithm: 'powers2',
  customSequence: [1, 7, 30, 90],
  heavyLoadThreshold: 9,
};

// ── File I/O ─────────────────────────────────────────────────────────────────

function readSchedule() {
  if (!fs.existsSync(scheduleFile)) {
    return { settings: { ...DEFAULT_SETTINGS }, tasks: [] };
  }
  const raw = JSON.parse(fs.readFileSync(scheduleFile, 'utf-8'));
  if (!raw.settings) raw.settings = { ...DEFAULT_SETTINGS };
  if (!raw.tasks) raw.tasks = [];
  return raw;
}

function writeSchedule(data) {
  const dir = path.dirname(scheduleFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(scheduleFile, JSON.stringify(data, null, 2));
}

// ── Hebrew Calendar ──────────────────────────────────────────────────────────
// Algorithm: Dershowitz & Reingold (Calendrical Calculations)

const HEBREW_EPOCH = 347997; // JDN of 1 Tishrei 1 AM

const HEBREW_MONTH_NAMES = {
  1: 'ניסן', 2: 'אייר', 3: 'סיוון', 4: 'תמוז', 5: 'אב', 6: 'אלול',
  7: 'תשרי', 8: 'חשוון', 9: 'כסלו', 10: 'טבת', 11: 'שבט',
  12: 'אדר', 13: 'אדר ב׳',
};

function isHebrewLeap(y) {
  return ((7 * y + 1) % 19) < 7;
}

function hebrewMonthsInYear(y) {
  return isHebrewLeap(y) ? 13 : 12;
}

function _hebrewCalcElapsed(y) {
  const months = Math.floor((235 * y - 234) / 19);
  const parts  = 12084 + 13753 * months;
  let   day    = months * 29 + Math.floor(parts / 25920);
  if ((3 * (day + 1)) % 7 < 3) day++;
  return day;
}

function hebrewYearStart(y) {
  const elapsed  = _hebrewCalcElapsed(y);
  const elapsed0 = _hebrewCalcElapsed(y - 1);
  const elapsed2 = _hebrewCalcElapsed(y + 1);
  let adj = 0;
  if (elapsed2 - elapsed === 356) adj = 2;
  else if (elapsed - elapsed0 === 382) adj = 1;
  return HEBREW_EPOCH + elapsed + adj + 1;
}

function hebrewYearLength(y) {
  return hebrewYearStart(y + 1) - hebrewYearStart(y);
}

function hebrewMonthLength(y, m) {
  const yl = hebrewYearLength(y);
  switch (m) {
    case 1:  return 30;
    case 2:  return 29;
    case 3:  return 30;
    case 4:  return 29;
    case 5:  return 30;
    case 6:  return 29;
    case 7:  return 30;
    case 8:  return (yl % 10 === 5) ? 30 : 29;  // Cheshvan
    case 9:  return (yl % 10 === 3) ? 29 : 30;  // Kislev
    case 10: return 29;
    case 11: return 30;
    case 12: return isHebrewLeap(y) ? 30 : 29;  // Adar/Adar-I
    case 13: return 29;                           // Adar-II (leap only)
    default: return 0;
  }
}

// Returns the JDN of day d, month m, year y (Hebrew)
function hebrewToJdn(y, m, d) {
  let jdn = hebrewYearStart(y) + d - 1;
  const numMonths = hebrewMonthsInYear(y);
  if (m >= 7) {
    for (let i = 7; i < m; i++) jdn += hebrewMonthLength(y, i);
  } else {
    for (let i = 7; i <= numMonths; i++) jdn += hebrewMonthLength(y, i);
    for (let i = 1; i < m; i++) jdn += hebrewMonthLength(y, i);
  }
  return jdn;
}

function jdnToHebrew(jdn) {
  let y = Math.floor(((jdn - HEBREW_EPOCH) * 98496.0) / 35975351.0);
  if (y < 1) y = 1;
  while (hebrewYearStart(y + 1) <= jdn) y++;
  while (hebrewYearStart(y) > jdn) y--;

  const numMonths = hebrewMonthsInYear(y);
  const order = [];
  for (let i = 7; i <= numMonths; i++) order.push(i);
  for (let i = 1; i <= 6; i++) order.push(i);

  let m = 7;
  for (const mo of order) {
    if (jdn <= hebrewToJdn(y, mo, hebrewMonthLength(y, mo))) { m = mo; break; }
  }
  const d = jdn - hebrewToJdn(y, m, 1) + 1;
  return { year: y, month: m, day: d };
}

function gregorianToJdn(year, month, day) {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return day + Math.floor((153 * m + 2) / 5) + 365 * y +
         Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
}

function gregorianToHebrew(year, month, day) {
  return jdnToHebrew(gregorianToJdn(year, month, day));
}

// Work-prohibited Jewish holidays by Hebrew month:day
// Rosh Hashana (7:1-2), Yom Kippur (7:10), Sukkot (7:15-16),
// Shemini Atzeret/Simchat Torah (7:22-23), Pesach (1:15-16, 1:21-22), Shavuot (3:6-7)
const HOLIDAY_SET = new Set([
  '7:1','7:2','7:10','7:15','7:16','7:22','7:23',
  '1:15','1:16','1:21','1:22',
  '3:6','3:7',
]);

function isJewishHoliday(hMonth, hDay) {
  return HOLIDAY_SET.has(`${hMonth}:${hDay}`);
}

// ── Date helpers ─────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function addDaysToStr(dateStr, n) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, mo - 1, d);
  dt.setDate(dt.getDate() + n);
  const yr = dt.getFullYear();
  const mn = String(dt.getMonth() + 1).padStart(2, '0');
  const dy = String(dt.getDate()).padStart(2, '0');
  return `${yr}-${mn}-${dy}`;
}

function dowOfStr(dateStr) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  return new Date(y, mo - 1, d).getDay(); // 0=Sun, 6=Sat
}

function isBlockedDay(dateStr) {
  if (dowOfStr(dateStr) === 6) return true; // Shabbat
  const [y, mo, d] = dateStr.split('-').map(Number);
  const heb = gregorianToHebrew(y, mo, d);
  return isJewishHoliday(heb.month, heb.day);
}

// Return the first non-blocked day at least `interval` days from startStr
function nextWorkDay(startStr, interval) {
  let candidate = addDaysToStr(startStr, interval);
  let safety = 0;
  while (isBlockedDay(candidate) && safety < 14) {
    candidate = addDaysToStr(candidate, 1);
    safety++;
  }
  return candidate;
}

// ── ID generator ─────────────────────────────────────────────────────────────

let _seq = 0;
function genId() {
  return `${Date.now()}-${(++_seq).toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// ── Algorithms ────────────────────────────────────────────────────────────────

function getIntervals(settings) {
  return settings.algorithm === 'custom'
    ? (settings.customSequence || DEFAULT_SETTINGS.customSequence)
    : [1, 2, 4, 8, 16, 32, 64];
}

// ── Public API ────────────────────────────────────────────────────────────────

function getTodayTasks() {
  const { tasks } = readSchedule();
  const today = todayStr();
  return tasks.filter(t => t.dueDate === today && !t.completed);
}

function completeTask(taskId) {
  const schedule = readSchedule();
  const task = schedule.tasks.find(t => t.id === taskId);
  if (!task) throw new Error('משימה לא נמצאה');
  task.completed   = true;
  task.completedAt = new Date().toISOString();
  writeSchedule(schedule);
  return task;
}

function planSummary(summaryPath, title) {
  const schedule  = readSchedule();
  const intervals = getIntervals(schedule.settings);
  const today     = todayStr();
  const newTasks  = [];

  // Initial study task — due today
  newTasks.push({
    id: genId(), summaryPath, title,
    type: 'completion', dueDate: today,
    completed: false, completedAt: null,
    reviewNumber: 0, scheduledFrom: today,
  });

  // Spaced review tasks
  intervals.forEach((interval, i) => {
    newTasks.push({
      id: genId(), summaryPath, title,
      type: 'review', dueDate: nextWorkDay(today, interval),
      completed: false, completedAt: null,
      reviewNumber: i + 1, scheduledFrom: today,
    });
  });

  schedule.tasks.push(...newTasks);
  writeSchedule(schedule);
  return newTasks;
}

function getCalendarData(yearMonth) {
  const [year, month] = yearMonth.split('-').map(Number);
  const schedule   = readSchedule();
  const today      = todayStr();
  const daysInMonth = new Date(year, month, 0).getDate();
  const days = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const mn      = String(month).padStart(2, '0');
    const dy      = String(d).padStart(2, '0');
    const dateStr = `${year}-${mn}-${dy}`;
    const dayTasks   = schedule.tasks.filter(t => t.dueDate === dateStr);
    const totalTasks = dayTasks.length;
    const doneTasks  = dayTasks.filter(t => t.completed).length;
    const heb     = gregorianToHebrew(year, month, d);
    const shabbat = dowOfStr(dateStr) === 6;
    const holiday = !shabbat && isJewishHoliday(heb.month, heb.day);

    days.push({
      date: dateStr,
      isPast:    dateStr < today,
      isToday:   dateStr === today,
      isShabbat: shabbat,
      isHoliday: holiday,
      totalTasks,
      doneTasks,
      hebrewDay: heb.day,
      hebrewMonth: heb.month,
      hebrewYear: heb.year,
      hebrewMonthName: HEBREW_MONTH_NAMES[heb.month] || '',
    });
  }

  return { days, settings: schedule.settings };
}

function getSettings() {
  return readSchedule().settings;
}

function saveSettings(newSettings) {
  const schedule = readSchedule();
  // Validate customSequence if provided
  if (newSettings.customSequence) {
    if (!Array.isArray(newSettings.customSequence) ||
        newSettings.customSequence.some(n => !Number.isInteger(n) || n < 1)) {
      throw new Error('רצף מותאם אישית חייב להיות מערך של מספרים שלמים חיוביים');
    }
  }
  schedule.settings = { ...DEFAULT_SETTINGS, ...schedule.settings, ...newSettings };
  writeSchedule(schedule);
  return schedule.settings;
}

module.exports = {
  getTodayTasks, completeTask,
  planSummary,
  getCalendarData,
  getSettings, saveSettings,
  readSchedule, writeSchedule,
  gregorianToHebrew, HEBREW_MONTH_NAMES,
};
