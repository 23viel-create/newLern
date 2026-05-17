const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getNextKey, recordUsage, recordError, getKeyStatus, getApiKeys, saveApiKeys } = require('../config/gemini');
const { MAX_PROMPT_CHARS, MAX_CONTEXT_CHARS, ARTICLES_DIR } = require('../config/limits');

const ARTICLES_PATH = path.join(__dirname, ARTICLES_DIR);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function _sanitize(text) {
  if (typeof text !== 'string') return '';
  // strip potential injection delimiters and truncate
  return text
    .replace(/```/g, "'''")
    .replace(/<\|/g, '<')
    .replace(/\|>/g, '>')
    .slice(0, MAX_CONTEXT_CHARS);
}

async function _callGemini(prompt) {
  const key = getNextKey();
  if (!key) throw new Error('אין מפתחות Gemini API מוגדרים — הוסף מפתח בהגדרות');

  const totalChars = prompt.length;
  if (totalChars > MAX_PROMPT_CHARS) throw new Error(`הפרומפט ארוך מדי (${totalChars} תווים, מקסימום ${MAX_PROMPT_CHARS})`);

  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    recordUsage(key, totalChars + (text?.length || 0));
    return text;
  } catch (err) {
    recordError(key);
    throw new Error(`שגיאת Gemini API: ${err.message}`);
  }
}

function _loadArticles() {
  try {
    const files = fs.readdirSync(ARTICLES_PATH).filter(f => f.endsWith('.json'));
    return files.map(f => {
      try {
        return JSON.parse(fs.readFileSync(path.join(ARTICLES_PATH, f), 'utf8'));
      } catch {
        return null;
      }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

// ─── Context-aware ask ────────────────────────────────────────────────────────

async function askContextual({ context, userMessage, extra }) {
  const safeMsg = _sanitize(userMessage);
  if (!safeMsg) throw new Error('הודעה ריקה');

  let systemPart = '';

  if (context === 'editor') {
    const safeContent = _sanitize(extra?.content || '');
    const safeTitle = _sanitize(extra?.title || '');
    systemPart = `אתה מסייע לימודי המתמחה בניתוח סיכומים.
הסיכום הנוכחי שהמשתמש עובד עליו:
כותרת: ${safeTitle}
תוכן: ${safeContent}

עזור למשתמש לנתח, להרחיב או למצוא מקורות לסיכום זה. ענה בעברית בלבד.`;
  } else if (context === 'quiz') {
    const safeTitle = _sanitize(extra?.title || '');
    const existingQ = _sanitize(JSON.stringify(extra?.existingQuestions || []).slice(0, 500));
    systemPart = `אתה מסייע לימודי המתמחה ביצירת שאלות.
נושא הבחינה: ${safeTitle}
שאלות קיימות (אל תחזור עליהן): ${existingQ}

הצע שאלות חדשות ומגוונות. ענה בעברית בלבד.`;
  } else if (context === 'calendar') {
    const safeSchedule = _sanitize(JSON.stringify(extra?.heavyDays || []).slice(0, 500));
    systemPart = `אתה מסייע לימודי המתמחה בתכנון לוחות זמנים.
ימים עמוסים זוהו: ${safeSchedule}

הצע דרכים לפזר את עומס החזרות ולשמור על לימוד יעיל. ענה בעברית בלבד.`;
  } else if (context === 'articles') {
    const articles = _loadArticles();
    const corpus = articles.map(a => `[${a.title}]\n${a.content}`).join('\n\n---\n\n').slice(0, MAX_CONTEXT_CHARS);
    systemPart = `אתה מסייע לימודי המתמחה בתיאוריות למידה פעילה.
להלן ספריית המאמרים הרלוונטיים — ענה אך ורק על בסיס מידע זה:

${corpus}

ענה בעברית בלבד ובצורה ממוקדת ומעשית.`;
  } else {
    systemPart = 'אתה מסייע לימודי כללי. ענה בעברית בלבד.';
  }

  const prompt = `${systemPart}\n\nשאלת המשתמש: ${safeMsg}`;
  return await _callGemini(prompt);
}

// ─── Suggest questions ────────────────────────────────────────────────────────

async function suggestQuestions({ summaryContent, summaryTitle, existingQuestions = [], type = 'open' }) {
  const safeContent = _sanitize(summaryContent || '');
  const safeTitle = _sanitize(summaryTitle || '');
  const existingStr = existingQuestions.slice(0, 10).map(q => `- ${_sanitize(q)}`).join('\n');

  const typeLabel = type === 'mc' ? 'רב-ברירה (multiple-choice)' : 'פתוחות';
  const formatInstr = type === 'mc'
    ? 'כל שאלה: שאלה, ואז 4 אפשרויות (א-ד) ותשובה נכונה. פורמט JSON: [{question, options:[{text,correct}], explanation}]'
    : 'פורמט JSON: [{question, sampleAnswer}]';

  const prompt = `אתה מסייע לימודי. צור 5 שאלות ${typeLabel} על בסיס הסיכום הבא.
אל תחזור על שאלות קיימות.

כותרת הסיכום: ${safeTitle}
תוכן הסיכום: ${safeContent}

שאלות קיימות שאין לחזור עליהן:
${existingStr || 'אין'}

${formatInstr}

ענה אך ורק ב-JSON תקין, ללא טקסט נוסף.`;

  const raw = await _callGemini(prompt);
  try {
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    return JSON.parse(jsonStr);
  } catch {
    return { raw };
  }
}

// ─── Schedule advice ──────────────────────────────────────────────────────────

async function getScheduleAdvice({ heavyDays, totalTasks }) {
  const safeHeavy = _sanitize(JSON.stringify(heavyDays || []).slice(0, 400));

  const prompt = `אתה מסייע לתכנון לוחות לימוד בשיטת חזרה מרווחת.
ימים עמוסים (מעל 9 פריטי חזרה): ${safeHeavy}
סה"כ פריטים לחזרה השבוע: ${Number(totalTasks) || 0}

הצע תוכנית פשוטה לפיזור העומס על ימים אחרים בשבוע.
ענה בעברית בלבד, עד 5 משפטים.`;

  return await _callGemini(prompt);
}

// ─── Article chat ─────────────────────────────────────────────────────────────

async function chatWithArticles(userMessage) {
  return await askContextual({ context: 'articles', userMessage });
}

// ─── Generate learning program ────────────────────────────────────────────────

async function generateLearningProgram({ goals, daysPerWeek, hoursPerDay }) {
  const articles = _loadArticles();
  const corpus = articles.map(a => `[${a.title}]\n${a.content.slice(0, 600)}`).join('\n\n---\n\n').slice(0, MAX_CONTEXT_CHARS);
  const safeGoals = _sanitize(goals || '');

  const prompt = `אתה מומחה לתכנון תוכניות לימוד מבוססות מחקר.
על בסיס המאמרים הבאים בלבד:

${corpus}

צור תוכנית לימוד שבועית אישית עבור:
- מטרות: ${safeGoals}
- ימי לימוד בשבוע: ${Number(daysPerWeek) || 5}
- שעות ביום: ${Number(hoursPerDay) || 1}

כלול: חלוקת נושאים, אסטרטגיות מומלצות, ואיך לשלב חזרה מרווחת ובחינה עצמית.
ענה בעברית בלבד, בפורמט ברור עם כותרות.`;

  return await _callGemini(prompt);
}

// ─── Keys management ─────────────────────────────────────────────────────────

function getKeys() {
  return getApiKeys();
}

function updateKeys(keys) {
  saveApiKeys(keys);
}

module.exports = {
  askContextual,
  suggestQuestions,
  getScheduleAdvice,
  chatWithArticles,
  generateLearningProgram,
  getKeyStatus,
  getKeys,
  updateKeys,
};
