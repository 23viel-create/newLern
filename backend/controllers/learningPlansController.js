'use strict';
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getNextKey, recordUsage, recordError, recordQuotaExhausted } = require('../config/gemini');
const { readSchedule, writeSchedule, gregorianToHebrew, HEBREW_MONTH_NAMES } = require('./srController');

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
  return new Date(y, mo - 1, d).getDay() === 6; // 6 = Sat
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

// ── Syllabus generator ────────────────────────────────────────────────────────

async function generateLearningPlan(req, res) {
  try {
    const {
      bookName, authorName, pace,
      endCondition,     // 'book' | 'date'
      targetDate,       // ISO date string (used when endCondition === 'date')
      startDate,        // ISO date string, defaults to today
      hebrewStartDate,  // free-text Hebrew date (NLP resolved by AI)
      startingPoint,    // optional chapter/page to start from
      skipShabbat,
      skipHolidays,
      isCustomBook,     // boolean — custom book with explicit bounds
      unitType,         // 'עמודים' | 'פרקים' | 'דפים'
      startUnit,        // number — first unit to study
      endUnit,          // number — last unit to study
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

    // ── Current date anchor (injected into prompt as ground truth) ───────────
    const todayIso  = new Date().toISOString().slice(0, 10);
    const todayHeb  = (() => {
      try {
        const [y, m, d] = todayIso.split('-').map(Number);
        const h = gregorianToHebrew(y, m, d);
        const monthName = HEBREW_MONTH_NAMES[h.month] || `חודש ${h.month}`;
        return `${h.day} ב${monthName} ${h.year}`;
      } catch { return ''; }
    })();

    // ── Step 1: AI generates syllabus array ──────────────────────────────────
    const endNote = endCondition === 'date' && targetDate
      ? `ועד לתאריך ${targetDate} (הגבל את מספר הפריטים בהתאם)`
      : 'עד סוף הספר (הפק רשימה שלמה)';

    const startNote = safePoint && safePoint !== 'מההתחלה'
      ? `\nנקודת התחלה בספר: ${safePoint} — הפריט הראשון חייב להתחיל מנקודה זו בדיוק.`
      : '';

    const hebDateNote = safeHebDate
      ? `\n\n## תאריך התחלה עברי (NLP)\nהמשתמש ציין תאריך התחלה עברי בטקסט חופשי: "${safeHebDate}".\nהשתמש בעוגן התאריך הנוכחי לעיל כדי לפרש את התאריך העברי הזה לתאריך לועזי מדויק, והחזר אותו בשדה "resolvedStartDate" (ISO YYYY-MM-DD) ב-JSON שלך.\nאם אינך מצליח לפרש, השתמש בתאריך הנוכחי.`
      : '';

    const boundsNote = (startUnit && endUnit)
      ? `\n\n## הגבלת יחידות\nסוג יחידה: ${unitType || 'יחידות'}.\nהמשתמש הגדיר טווח מחייב: מ-${unitType || 'יחידה'} ${startUnit} עד ${unitType || 'יחידה'} ${endUnit}.\nחובה להגביל את כל פריטי הלימוד בדיוק לטווח זה. אל תכלול יחידות מחוץ לטווח [${startUnit}–${endUnit}].`
      : '';

    const prompt = `אתה מומחה בתכנון לימוד של ספרות תורנית ואקדמית.

## עוגן תאריך נוכחי
תאריך מערכת היום (לועזי): ${todayIso}${todayHeb ? `\nתאריך עברי מקביל: ${todayHeb}` : ''}.
השתמש בעוגן זה כתאריך ייחוס מוחלט לכל חישובי תאריך.

## בקשת המשתמש
ספר: "${safeBook}"${safeAuthor ? ` (מאת ${safeAuthor})` : ''}.
קצב התקדמות: "${safePace}" לכל יום לימוד.
תנאי סיום: ${endNote}.${startNote}${hebDateNote}${boundsNote}

## משימה
1. נתח את מבנה הספר (פרקים, דפים, הלכות, חלקים — לפי מה שמתאים).
2. חלק לפי הקצב המבוקש${startUnit && endUnit ? ` בתוך הטווח [${startUnit}–${endUnit}] בלבד` : ''}.
3. הפק מערך JSON של פריטי לימוד יומיים.

## פורמט פלט — JSON בלבד, ללא טקסט נוסף:
[{"title":"שם הפריט הספציפי לקריאה"}, ...]
${safeHebDate ? '\nאם פירשת תאריך עברי, הוסף לאובייקט הראשון: {"title":"...","resolvedStartDate":"YYYY-MM-DD"}' : ''}

## דוגמאות
• גמרא יומא: [{"title":"יומא דף ב׳ א׳–ב׳"}, {"title":"יומא דף ג׳ א׳–ב׳"}]
• משנה תורה, הלכות דעות: [{"title":"הלכות דעות פרק א׳"}, {"title":"הלכות דעות פרק ב׳"}]
• ספר כללי: [{"title":"פרק 1: שם הפרק"}, {"title":"פרק 2: שם הפרק"}]

חשוב: כותרות ספציפיות ומפורטות. הגבל ל-365 פריטים לכל היותר.
ענה ב-JSON בלבד.`;

    const raw = await _callGemini(prompt);
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    let syllabusItems;
    try { syllabusItems = JSON.parse(jsonStr); }
    catch { return res.status(500).json({ success: false, message: 'תגובת ה-AI אינה JSON תקין. נסה לנסח מחדש את הבקשה.' }); }

    if (!Array.isArray(syllabusItems) || !syllabusItems.length) {
      return res.status(500).json({ success: false, message: 'ה-AI לא הצליח ליצור תוכנית לימוד. נסה שנית.' });
    }

    // Cap at 365
    syllabusItems = syllabusItems.slice(0, 365);

    // ── Step 2: Chronological day-skipping scheduler ─────────────────────────
    let cursor = startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate)
      ? startDate
      : new Date().toISOString().slice(0, 10);

    const endDateMs = endCondition === 'date' && targetDate
      ? new Date(targetDate + 'T23:59:59').getTime()
      : Infinity;

    const newTasks = [];
    const today = new Date().toISOString().slice(0, 10);

    for (const item of syllabusItems) {
      const title = typeof item.title === 'string' ? item.title.trim() : String(item).trim();
      if (!title) continue;

      // Advance past blocked days
      let safety = 0;
      while (safety < 30) {
        const curMs = new Date(cursor + 'T12:00:00').getTime();
        if (curMs > endDateMs) break;

        const blocked =
          (skipShabbat  && _isShabbat(cursor)) ||
          (skipHolidays && _isJewishHoliday(cursor));

        if (!blocked) break;
        cursor = _addDays(cursor, 1);
        safety++;
      }

      // Check date cap
      if (new Date(cursor + 'T12:00:00').getTime() > endDateMs) break;

      newTasks.push({
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
      });

      cursor = _addDays(cursor, 1);
    }

    if (!newTasks.length) {
      return res.status(400).json({ success: false, message: 'לא נוצרו משימות — בדוק את פרמטרי התוכנית' });
    }

    // ── Step 3: Persist to schedule.json ────────────────────────────────────
    const schedule = readSchedule();
    schedule.tasks.push(...newTasks);
    writeSchedule(schedule);

    res.json({
      success: true,
      data: {
        count: newTasks.length,
        firstDate: newTasks[0].dueDate,
        lastDate:  newTasks[newTasks.length - 1].dueDate,
        tasks:     newTasks,
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

module.exports = { generateLearningPlan, optimizePlan };
