'use strict';
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getNextKey, recordUsage, recordError, recordQuotaExhausted } = require('../config/gemini');
const { readSchedule, writeSchedule, gregorianToHebrew, HEBREW_MONTH_NAMES } = require('./srController');
const fs   = require('fs');
const path = require('path');

// ── Gemini helper ────────────────────────────────────────────────────────────

async function _callGemini(prompt) {
  const key = getNextKey();
  if (!key) throw new Error('אין מפתחות Gemini API מוגדרים — הוסף מפתח בהגדרות');
  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    recordUsage(key, prompt.length + (text?.length || 0));
    return text;
  } catch (err) {
    const msg = err.message || '';
    if (msg.includes('429') || /quota/i.test(msg)) recordQuotaExhausted(key);
    else recordError(key);
    throw err;
  }
}

// ── Study Paths persistence ──────────────────────────────────────────────────

const STUDY_PATHS_FILE = path.join(__dirname, '../../data/study_paths.json');

function readStudyPaths() {
  try {
    if (!fs.existsSync(STUDY_PATHS_FILE)) return { paths: [] };
    return JSON.parse(fs.readFileSync(STUDY_PATHS_FILE, 'utf8'));
  } catch { return { paths: [] }; }
}

function writeStudyPaths(data) {
  fs.writeFileSync(STUDY_PATHS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// ── Jewish holiday set (matching srController's HOLIDAY_SET) ─────────────────

const HOLIDAY_SET = new Set([
  '7:1','7:2','7:10','7:15','7:16','7:22','7:23',
  '1:15','1:16','1:21','1:22',
  '3:6','3:7',
]);

function _isJewishHoliday(isoDate) {
  const [y, mo, d] = isoDate.split('-').map(Number);
  const heb = gregorianToHebrew(y, mo, d);
  return HOLIDAY_SET.has(`${heb.month}:${heb.day}`);
}

function _isShabbat(isoDate) {
  const [y, mo, d] = isoDate.split('-').map(Number);
  return new Date(y, mo - 1, d).getDay() === 6;
}

function _addDays(isoDate, n) {
  const [y, mo, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, mo - 1, d);
  dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

// ── ID generator ─────────────────────────────────────────────────────────────

let _seq = 0;
function _genId() {
  return `lp-${Date.now()}-${(++_seq).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

// ── AI Output Validation Guard ────────────────────────────────────────────────

function _validateSchedule(syllabusItems, startUnit, endUnit, isCustomBook) {
  if (!Array.isArray(syllabusItems) || syllabusItems.length === 0) {
    return { valid: false, reason: 'מערך פריטים ריק' };
  }

  if (isCustomBook && startUnit != null && endUnit != null) {
    const withUnits = syllabusItems.filter(
      item => item.unitStart != null && item.unitEnd != null &&
              Number.isFinite(Number(item.unitStart)) && Number.isFinite(Number(item.unitEnd))
    );

    if (withUnits.length > 0) {
      const totalUnits = withUnits.reduce(
        (sum, item) => sum + (Number(item.unitEnd) - Number(item.unitStart) + 1), 0
      );
      const expected  = endUnit - startUnit + 1;
      const tolerance = Math.max(1, Math.ceil(expected * 0.02));

      if (Math.abs(totalUnits - expected) > tolerance) {
        return {
          valid: false,
          reason: `כמות היחידות שתוזמנה (${totalUnits}) אינה תואמת את הטווח המבוקש (${expected} יחידות). חזור על החישוב בדיוק מ-${startUnit} עד ${endUnit}.`,
        };
      }

      if (Number(withUnits[0].unitStart) !== startUnit) {
        return {
          valid: false,
          reason: `יחידת ההתחלה (${withUnits[0].unitStart}) שונה מהנדרש (${startUnit}).`,
        };
      }

      if (Number(withUnits[withUnits.length - 1].unitEnd) !== endUnit) {
        return {
          valid: false,
          reason: `יחידת הסיום (${withUnits[withUnits.length - 1].unitEnd}) שונה מהנדרש (${endUnit}).`,
        };
      }
    }
  }

  return { valid: true };
}

// ── Prompt builder ────────────────────────────────────────────────────────────

function _buildGeneratePrompt({
  safeBook, safeAuthor, safePace, safePoint, safeHebDate,
  todayIso, todayHeb, endNote,
  isCustomBook, unitType, startUnit, endUnit,
}) {
  const startNote = safePoint && safePoint !== 'מההתחלה'
    ? `\nנקודת התחלה בספר: ${safePoint} — הפריט הראשון חייב להתחיל מנקודה זו בדיוק.`
    : '';

  const hebDateNote = safeHebDate
    ? `\n\n## תאריך התחלה עברי (NLP)\nהמשתמש ציין תאריך התחלה עברי בטקסט חופשי: "${safeHebDate}".\nהשתמש בעוגן התאריך הנוכחי לעיל כדי לפרש את התאריך העברי הזה לתאריך לועזי מדויק, והחזר אותו בשדה "resolvedStartDate" (ISO YYYY-MM-DD) ב-JSON שלך.\nאם אינך מצליח לפרש, השתמש בתאריך הנוכחי.`
    : '';

  const boundsNote = (startUnit && endUnit)
    ? `\n\n## הגבלת יחידות\nסוג יחידה: ${unitType || 'יחידות'}.\nהמשתמש הגדיר טווח מחייב: מ-${unitType || 'יחידה'} ${startUnit} עד ${unitType || 'יחידה'} ${endUnit}.\nחובה להגביל את כל פריטי הלימוד בדיוק לטווח זה. אל תכלול יחידות מחוץ לטווח [${startUnit}–${endUnit}].`
    : '';

  const customBookBlock = isCustomBook
    ? `\n\n## ⚠️ הוראה קריטית — ספר לא ידוע / מותאם אישית
הספר שצוין הוא ספר לא ידוע או מותאם אישית שאין לך עליו ידע חיצוני.
**חל איסור מוחלט** להשתמש בידע קיים על תוכן הספר, שמות פרקיו, נושאיו, או כל מידע שמקורו מחוץ לפרמטרים שסופקו.
עליך לתזמן בחישוב מתמטי מדויק: מ-${unitType || 'יחידה'} ${startUnit} עד ${unitType || 'יחידה'} ${endUnit}.
סכום כל היחידות המתוזמנות חייב להיות בדיוק ${endUnit - startUnit + 1}.
כל פריט חייב לכלול שדות "unitStart" ו-"unitEnd" מספריים המתארים את הטווח המדויק.
אל תמציא שמות נושאים — השתמש אך ורק בטווח המספרי.`
    : '';

  const outputFormat = isCustomBook
    ? `[{"title":"${unitType || 'יחידות'} X–Y","unitStart":X,"unitEnd":Y}, ...]
כל פריט חייב לכלול שדות "unitStart" ו-"unitEnd" מספריים.`
    : `[{"title":"שם הפריט הספציפי לקריאה"}, ...]`;

  const examples = isCustomBook
    ? `• ספר מותאם (${unitType || 'עמוד'} 1–20, קצב 5 ליום): [{"title":"${unitType || 'עמודים'} 1–5","unitStart":1,"unitEnd":5},{"title":"${unitType || 'עמודים'} 6–10","unitStart":6,"unitEnd":10}]`
    : `• גמרא יומא: [{"title":"יומא דף ב׳ א׳–ב׳"}, {"title":"יומא דף ג׳ א׳–ב׳"}]
• משנה תורה, הלכות דעות: [{"title":"הלכות דעות פרק א׳"}, {"title":"הלכות דעות פרק ב׳"}]
• ספר כללי: [{"title":"פרק 1: שם הפרק"}, {"title":"פרק 2: שם הפרק"}]`;

  return `אתה מומחה בתכנון לימוד של ספרות תורנית ואקדמית.

## עוגן תאריך נוכחי
תאריך מערכת היום (לועזי): ${todayIso}${todayHeb ? `\nתאריך עברי מקביל: ${todayHeb}` : ''}.
השתמש בעוגן זה כתאריך ייחוס מוחלט לכל חישובי תאריך.

## בקשת המשתמש
ספר: "${safeBook}"${safeAuthor ? ` (מאת ${safeAuthor})` : ''}.
קצב התקדמות: "${safePace}" לכל יום לימוד.
תנאי סיום: ${endNote}.${startNote}${hebDateNote}${boundsNote}${customBookBlock}

## משימה
1. נתח את מבנה הספר (פרקים, דפים, הלכות, חלקים — לפי מה שמתאים).
2. חלק לפי הקצב המבוקש${startUnit && endUnit ? ` בתוך הטווח [${startUnit}–${endUnit}] בלבד` : ''}.
3. הפק מערך JSON של פריטי לימוד יומיים.

## פורמט פלט — JSON בלבד, ללא טקסט נוסף:
${outputFormat}
${safeHebDate ? '\nאם פירשת תאריך עברי, הוסף לאובייקט הראשון: {"title":"...","resolvedStartDate":"YYYY-MM-DD"}' : ''}

## דוגמאות
${examples}

חשוב: כותרות ספציפיות ומפורטות. הגבל ל-365 פריטים לכל היותר.
ענה ב-JSON בלבד.`;
}

// ── Shared task scheduler ─────────────────────────────────────────────────────

function _scheduleTasks(syllabusItems, {
  startDate, endDateMs = Infinity, skipShabbat, skipHolidays,
  safeBook, safeAuthor, today,
}) {
  let cursor = startDate;
  const tasks = [];

  for (const item of syllabusItems) {
    const title = typeof item.title === 'string' ? item.title.trim() : String(item).trim();
    if (!title) continue;

    let safety = 0;
    while (safety < 30) {
      if (new Date(cursor + 'T12:00:00').getTime() > endDateMs) break;
      const blocked =
        (skipShabbat  && _isShabbat(cursor)) ||
        (skipHolidays && _isJewishHoliday(cursor));
      if (!blocked) break;
      cursor = _addDays(cursor, 1);
      safety++;
    }

    if (new Date(cursor + 'T12:00:00').getTime() > endDateMs) break;

    tasks.push({
      id:            _genId(),
      summaryPath:   `לימוד/${safeBook}`,
      title,
      type:          'learning-plan',
      dueDate:       cursor,
      completed:     false,
      completedAt:   null,
      reviewNumber:  0,
      scheduledFrom: today,
      programId:     'learning-plan',
      bookName:      safeBook,
      authorName:    safeAuthor,
      unitStart:     item.unitStart != null ? Number(item.unitStart) : null,
      unitEnd:       item.unitEnd   != null ? Number(item.unitEnd)   : null,
    });

    cursor = _addDays(cursor, 1);
  }

  return tasks;
}

// ── AI call with validation retry loop ───────────────────────────────────────

async function _generateWithRetry(promptParams, startUnit, endUnit, isCustomBook) {
  const MAX_ATTEMPTS = 3;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let raw;
    try {
      raw = await _callGemini(_buildGeneratePrompt(promptParams));
    } catch (err) {
      console.warn(`AI Schedule Validation Failed. Retrying... (attempt ${attempt}/${MAX_ATTEMPTS}): ${err.message}`);
      if (attempt < MAX_ATTEMPTS) continue;
      throw err;
    }

    const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    let parsed;
    try { parsed = JSON.parse(jsonStr); }
    catch {
      console.warn(`AI Schedule Validation Failed. Retrying... (attempt ${attempt}/${MAX_ATTEMPTS}): invalid JSON`);
      continue;
    }

    if (!Array.isArray(parsed) || !parsed.length) {
      console.warn(`AI Schedule Validation Failed. Retrying... (attempt ${attempt}/${MAX_ATTEMPTS}): empty array`);
      continue;
    }

    const validation = _validateSchedule(parsed, startUnit, endUnit, isCustomBook);
    if (!validation.valid) {
      console.warn(`AI Schedule Validation Failed. Retrying... (attempt ${attempt}/${MAX_ATTEMPTS}): ${validation.reason}`);
      if (attempt < MAX_ATTEMPTS) continue;
      // Final attempt: accept with logged warning
    }

    return parsed;
  }

  return null;
}

// ── Syllabus generator ────────────────────────────────────────────────────────

async function generateLearningPlan(req, res) {
  try {
    const {
      bookName, authorName, pace,
      endCondition, targetDate, startDate, hebrewStartDate,
      startingPoint, skipShabbat, skipHolidays,
      isCustomBook, unitType, startUnit, endUnit,
    } = req.body;

    if (!bookName || !pace) {
      return res.status(400).json({ success: false, message: 'שם הספר וקצב ההתקדמות נדרשים' });
    }
    if (isCustomBook && (!startUnit || !endUnit)) {
      return res.status(400).json({ success: false, message: 'חובה להזין יחידת התחלה וסיום עבור ספר מותאם אישית' });
    }

    const safeBook    = String(bookName).slice(0, 120);
    const safeAuthor  = String(authorName || '').slice(0, 80);
    const safePace    = String(pace).slice(0, 120);
    const safePoint   = startingPoint ? String(startingPoint).slice(0, 120).trim() : '';
    const safeHebDate = hebrewStartDate ? String(hebrewStartDate).slice(0, 80).trim() : '';

    const todayIso = new Date().toISOString().slice(0, 10);
    const todayHeb = (() => {
      try {
        const [y, m, d] = todayIso.split('-').map(Number);
        const h = gregorianToHebrew(y, m, d);
        const monthName = HEBREW_MONTH_NAMES[h.month] || `חודש ${h.month}`;
        return `${h.day} ב${monthName} ${h.year}`;
      } catch { return ''; }
    })();

    const endNote = endCondition === 'date' && targetDate
      ? `ועד לתאריך ${targetDate} (הגבל את מספר הפריטים בהתאם)`
      : 'עד סוף הספר (הפק רשימה שלמה)';

    const effStartUnit = isCustomBook ? Number(startUnit) : null;
    const effEndUnit   = isCustomBook ? Number(endUnit)   : null;

    const promptParams = {
      safeBook, safeAuthor, safePace, safePoint, safeHebDate,
      todayIso, todayHeb, endNote,
      isCustomBook: !!isCustomBook, unitType,
      startUnit: effStartUnit, endUnit: effEndUnit,
    };

    const syllabusItems = await _generateWithRetry(promptParams, effStartUnit, effEndUnit, !!isCustomBook);

    if (!syllabusItems) {
      return res.status(500).json({ success: false, message: 'ה-AI לא הצליח ליצור תוכנית לימוד. נסה שנית.' });
    }

    // Resolve Hebrew start date if AI returned one
    let cursor = startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate)
      ? startDate
      : todayIso;
    if (safeHebDate && syllabusItems[0]?.resolvedStartDate &&
        /^\d{4}-\d{2}-\d{2}$/.test(syllabusItems[0].resolvedStartDate)) {
      cursor = syllabusItems[0].resolvedStartDate;
    }

    const endDateMs = endCondition === 'date' && targetDate
      ? new Date(targetDate + 'T23:59:59').getTime()
      : Infinity;

    const newTasks = _scheduleTasks(syllabusItems.slice(0, 365), {
      startDate: cursor, endDateMs,
      skipShabbat: !!skipShabbat, skipHolidays: !!skipHolidays,
      safeBook, safeAuthor, today: todayIso,
    });

    if (!newTasks.length) {
      return res.status(400).json({ success: false, message: 'לא נוצרו משימות — בדוק את פרמטרי התוכנית' });
    }

    const schedule = readSchedule();
    schedule.tasks.push(...newTasks);
    writeSchedule(schedule);

    const pathId = _genId();
    const pathRecord = {
      id:           pathId,
      bookName:     safeBook,
      authorName:   safeAuthor,
      pace:         safePace,
      unitType:     isCustomBook ? (unitType || 'יחידות') : null,
      startUnit:    effStartUnit,
      endUnit:      effEndUnit,
      isCustomBook: !!isCustomBook,
      createdAt:    todayIso,
      startDate:    newTasks[0].dueDate,
      endDate:      newTasks[newTasks.length - 1].dueDate,
      taskCount:    newTasks.length,
      taskIds:      newTasks.map(t => t.id),
    };
    const studyPathsData = readStudyPaths();
    studyPathsData.paths.push(pathRecord);
    writeStudyPaths(studyPathsData);

    res.json({
      success: true,
      data: {
        count:     newTasks.length,
        firstDate: newTasks[0].dueDate,
        lastDate:  newTasks[newTasks.length - 1].dueDate,
        tasks:     newTasks,
        pathId,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// ── AI Load-Balancing Consultant ──────────────────────────────────────────────

async function optimizePlan(req, res) {
  try {
    const schedule  = readSchedule();
    const threshold = schedule.settings.heavyLoadThreshold || 9;
    const today     = new Date().toISOString().slice(0, 10);

    const future = schedule.tasks.filter(t => !t.completed && t.dueDate >= today);
    const byDate  = {};
    for (const t of future) {
      if (!byDate[t.dueDate]) byDate[t.dueDate] = [];
      byDate[t.dueDate].push({ id: t.id, title: t.title });
    }

    const heavyDates = Object.entries(byDate)
      .filter(([, tasks]) => tasks.length > threshold)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, tasks]) => ({ date, count: tasks.length }));

    if (!heavyDates.length) {
      return res.json({
        success: true,
        data: { recommendation: 'לוח הלמידה שלך מאוזן — אין ימים עמוסים מעבר לסף הקבוע.', heavyDates: [], threshold },
      });
    }

    const summaryLines = heavyDates.map(d => `- ${d.date}: ${d.count} משימות`).join('\n');
    const prompt = `אתה יועץ לוח לימוד מומחה. להלן ימים עמוסים בלוח הלמידה (סף: ${threshold} משימות):
${summaryLines}

נתח את העומסים והצע תוכנית איזון מפורטת בעברית:
1. אילו ימים עמוסים ביותר ועל כמה להוריד כל יום.
2. לאיזה ימים סמוכים (קדימה/אחורה) כדאי להעביר משימות.
3. הסבר קצר מדוע האיזון ישפר את יעילות הלמידה.
ענה בעברית בלבד, בצורה ברורה ומפורטת.`;

    const text = await _callGemini(prompt);
    res.json({ success: true, data: { recommendation: text, heavyDates, threshold } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// ── Study Paths CRUD ──────────────────────────────────────────────────────────

async function getStudyPaths(req, res) {
  try {
    const data     = readStudyPaths();
    const schedule = readSchedule();
    const taskMap  = {};
    for (const t of schedule.tasks) taskMap[t.id] = t;

    const enriched = data.paths.map(p => {
      const ids       = p.taskIds || [];
      const completed = ids.filter(id => taskMap[id]?.completed).length;
      return { ...p, completedCount: completed, totalCount: ids.length };
    });

    res.json({ success: true, data: enriched });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function deleteStudyPath(req, res) {
  try {
    const { id } = req.params;
    const data = readStudyPaths();
    const idx  = data.paths.findIndex(p => p.id === id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'מסלול לא נמצא' });

    const pathRecord = data.paths[idx];
    const taskIdSet  = new Set(pathRecord.taskIds || []);

    const schedule = readSchedule();
    schedule.tasks = schedule.tasks.filter(t => !taskIdSet.has(t.id));
    writeSchedule(schedule);

    data.paths.splice(idx, 1);
    writeStudyPaths(data);

    res.json({ success: true, data: { deleted: id } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function editStudyPath(req, res) {
  try {
    const { id } = req.params;
    const { pace, skipShabbat, skipHolidays } = req.body;

    const data       = readStudyPaths();
    const pathRecord = data.paths.find(p => p.id === id);
    if (!pathRecord) return res.status(404).json({ success: false, message: 'מסלול לא נמצא' });

    const today     = new Date().toISOString().slice(0, 10);
    const schedule  = readSchedule();
    const taskIdSet = new Set(pathRecord.taskIds || []);

    const completedTasks = schedule.tasks.filter(
      t => taskIdSet.has(t.id) && (t.completed || t.dueDate < today)
    );
    const futureTasks = schedule.tasks.filter(
      t => taskIdSet.has(t.id) && !t.completed && t.dueDate >= today
    );

    if (futureTasks.length === 0) {
      return res.status(400).json({ success: false, message: 'אין משימות עתידיות לעריכה — המסלול הסתיים' });
    }

    // Remove future tasks from schedule in memory
    schedule.tasks = schedule.tasks.filter(
      t => !(taskIdSet.has(t.id) && !t.completed && t.dueDate >= today)
    );

    // For custom books: find next unit to continue from
    let effStartUnit = pathRecord.startUnit;
    const effEndUnit = pathRecord.endUnit;

    if (pathRecord.isCustomBook && pathRecord.endUnit != null) {
      const lastWithUnit = completedTasks
        .filter(t => t.unitEnd != null)
        .sort((a, b) => (a.dueDate > b.dueDate ? 1 : -1))
        .pop();
      effStartUnit = lastWithUnit ? Number(lastWithUnit.unitEnd) + 1 : pathRecord.startUnit;
    }

    const safeBook   = pathRecord.bookName;
    const safeAuthor = pathRecord.authorName || '';
    const safePace   = pace ? String(pace).slice(0, 120) : pathRecord.pace;

    const lastCompletedTask = completedTasks
      .sort((a, b) => (a.dueDate > b.dueDate ? 1 : -1))
      .pop();
    const safePoint = lastCompletedTask?.title || '';

    const todayHeb = (() => {
      try {
        const [y, m, d] = today.split('-').map(Number);
        const h = gregorianToHebrew(y, m, d);
        const monthName = HEBREW_MONTH_NAMES[h.month] || `חודש ${h.month}`;
        return `${h.day} ב${monthName} ${h.year}`;
      } catch { return ''; }
    })();

    const promptParams = {
      safeBook, safeAuthor, safePace, safePoint, safeHebDate: '',
      todayIso: today, todayHeb,
      endNote: 'עד סוף הספר (הפק רשימה שלמה)',
      isCustomBook: pathRecord.isCustomBook,
      unitType:     pathRecord.unitType,
      startUnit:    effStartUnit,
      endUnit:      effEndUnit,
    };

    const syllabusItems = await _generateWithRetry(
      promptParams, effStartUnit, effEndUnit, pathRecord.isCustomBook
    );

    if (!syllabusItems) {
      // Rollback
      schedule.tasks.push(...futureTasks);
      writeSchedule(schedule);
      return res.status(500).json({ success: false, message: 'ה-AI לא הצליח לחשב מחדש. השינויים בוטלו.' });
    }

    const skipShab = skipShabbat != null ? !!skipShabbat : true;
    const skipHol  = skipHolidays != null ? !!skipHolidays : true;

    const newTasks = _scheduleTasks(syllabusItems.slice(0, 365), {
      startDate: today, endDateMs: Infinity,
      skipShabbat: skipShab, skipHolidays: skipHol,
      safeBook, safeAuthor, today,
    });

    schedule.tasks.push(...newTasks);
    writeSchedule(schedule);

    pathRecord.pace      = safePace;
    pathRecord.endDate   = newTasks.length ? newTasks[newTasks.length - 1].dueDate : pathRecord.endDate;
    pathRecord.taskIds   = [...completedTasks.map(t => t.id), ...newTasks.map(t => t.id)];
    pathRecord.taskCount = pathRecord.taskIds.length;
    writeStudyPaths(data);

    res.json({
      success: true,
      data: {
        count:     newTasks.length,
        firstDate: newTasks[0]?.dueDate,
        lastDate:  newTasks.length ? newTasks[newTasks.length - 1].dueDate : null,
        tasks:     newTasks,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = { generateLearningPlan, optimizePlan, getStudyPaths, deleteStudyPath, editStudyPath };
