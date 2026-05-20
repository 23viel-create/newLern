const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getNextKey, recordUsage, recordError, recordQuotaExhausted, getKeyStatus, getApiKeys, saveApiKeys, getLbMode, setLbMode } = require('../config/gemini');
const { MAX_PROMPT_CHARS, MAX_CONTEXT_CHARS, ARTICLES_DIR } = require('../config/limits');
const { getSettings } = require('./srController');

const ARTICLES_PATH = ARTICLES_DIR;

// ─── AI scope guardrails ──────────────────────────────────────────────────────

const STRICT_KODESH_GUARDRAIL = `[הוראת מערכת — מצב לימוד ממוקד תורני]
אתה עוזר לימודי בהגבלה מחמירה. עליך לענות אך ורק על שאלות הנוגעות לטקסט הסיכום שסופק.
חריג: מותר לך להשתמש בידע הפנימי שלך לצורך מענה על שאלות הנוגעות למקורות קודש — תנ"ך, גמרא, הלכה, מפרשים, מדרש וכדומה.
אם המשתמש שואל שאלה חיצונית חילונית שאינה בסיכום ואינה נוגעת למקורות קודש — ענה: "אני מוגבל למצב לימוד ממוקד ואיני יכול לענות על שאלות שאינן קשורות לחומר הלימוד או למקורות קודש."`;

const SCOPE_REPOSITORY_ONLY = `[הוראת מערכת — מאגר ספרים בלבד]
אתה עוזר לימודי מוגבל. ענה אך ורק על בסיס הטקסטים ממאגר הספרים המקומי המצורפים להלן.
אם השאלה אינה ניתנת למענה על בסיס הטקסטים הבאים — ענה: "אני מוגבל למאגר הספרים המקומי ואינני יכול לענות על שאלה זו."

{{BOOKS}}`;

const SCOPE_REPOSITORY_KODESH = `[הוראת מערכת — מאגר ספרים ומקורות קודש]
אתה עוזר לימודי מוגבל. ענה על בסיס הטקסטים ממאגר הספרים המקומי המצורפים להלן.
חריג: מותר להשתמש בידע פנימי לשאלות הנוגעות למקורות קודש (תנ"ך, גמרא, הלכה, מפרשים, מדרש).
לשאלות חילוניות שאינן במאגר — ענה: "אני מוגבל למאגר הספרים ולמקורות קודש."

{{BOOKS}}`;

// selectedBooks: array of filenames to restrict RAG to, or null = all books
async function _buildScopeGuardrail(scope, strictKodesh, selectedBooks) {
  if (scope === 'repository_only' || scope === 'repository_kodesh') {
    const { getBooksContext, listBooks } = require('./booksController');
    // Default when no books explicitly selected: use sacred-texts (kodesh) mode
    const books = listBooks();
    let effectiveScope = scope;
    let booksText;
    if (!selectedBooks || !selectedBooks.length) {
      if (books.length === 0) {
        // No books at all — fall back to kodesh guardrail (sacred defaults)
        return STRICT_KODESH_GUARDRAIL + '\n\n';
      }
      booksText = await getBooksContext(2000, null);
    } else {
      booksText = await getBooksContext(2000, selectedBooks);
    }
    const template = effectiveScope === 'repository_only' ? SCOPE_REPOSITORY_ONLY : SCOPE_REPOSITORY_KODESH;
    return template.replace('{{BOOKS}}', booksText || '(אין ספרים במאגר כרגע)') + '\n\n';
  }
  if (scope !== 'unlimited' && strictKodesh) {
    return STRICT_KODESH_GUARDRAIL + '\n\n';
  }
  return '';
}

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

async function _callGemini(prompt, taskType = 'general') {
  const totalChars = prompt.length;
  if (totalChars > MAX_PROMPT_CHARS) throw new Error(`הפרומפט ארוך מדי (${totalChars} תווים, מקסימום ${MAX_PROMPT_CHARS})`);

  const status = getKeyStatus();
  if (status.length > 0 && status.filter(k => k.healthy).length === 0) {
    throw new Error('שגיאה: לא נשארו מפתחות API תקינים או פעילים במערכת. אנא הזן מפתח תקין במסך ההגדרות.');
  }

  // Retry loop — up to 3 attempts, rotating to a fresh key on every 429
  const maxAttempts = Math.min(3, Math.max(1, getApiKeys().length));
  let lastQuotaError;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const key = getNextKey(taskType);
    if (!key) {
      if (!status.length) throw new Error('אין מפתחות Gemini API מוגדרים — הוסף מפתח בהגדרות');
      const poolLabel = taskType === 'quiz' ? 'מבחנים' : 'צ\'אט';
      throw new Error(`אין מפתחות זמינים כרגע עבור משימות ${poolLabel}. המתן לסיום קירור המפתחות, או שנה את מצב חלוקת העומסים בהגדרות.`);
    }

    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    try {
      const result = await model.generateContent(prompt);
      const text   = result.response.text();
      recordUsage(key, totalChars + (text?.length || 0));
      return text;
    } catch (err) {
      const msg = err.message || '';
      if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || /quota/i.test(msg)) {
        recordQuotaExhausted(key);
        lastQuotaError = new Error('כל מפתחות ה-API הזמינים הגיעו למכסה. נסה שוב מאוחר יותר.');
        continue; // rotate to next key
      }
      if (msg.includes('503') || msg.includes('SERVICE_UNAVAILABLE') || /overload/i.test(msg)) {
        recordError(key);
        throw new Error('השרתים של גוגל עמוסים כרגע באופן זמני, אנא נסה שוב בעוד מספר רגעים.');
      }
      recordError(key);
      throw new Error(`שגיאת Gemini API: ${err.message}`);
    }
  }

  throw lastQuotaError || new Error('כל ניסיונות ה-API נכשלו. אנא נסה שנית.');
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

async function askContextual({ context, userMessage, extra, selectedBooks }) {
  const safeMsg = _sanitize(userMessage);
  if (!safeMsg) throw new Error('הודעה ריקה');

  const settings     = (() => { try { return getSettings(); } catch { return {}; } })();
  const scope        = settings.aiScopePreference || 'unlimited';
  const strictKodesh = !!settings.strictKodeshMode;
  const safeBooks    = Array.isArray(selectedBooks) ? selectedBooks.map(b => String(b)).filter(Boolean) : null;
  const guardrail    = await _buildScopeGuardrail(scope, strictKodesh, safeBooks);

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

  const prompt = `${guardrail}${systemPart}\n\nשאלת המשתמש: ${safeMsg}`;
  return await _callGemini(prompt, 'general');
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

  const raw = await _callGemini(prompt, 'quiz');
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

  return await _callGemini(prompt, 'general');
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

  return await _callGemini(prompt, 'general');
}

// ─── Parse SR program from Hebrew text ───────────────────────────────────────

async function parseSrProgramFromText(hebrewText) {
  const safeText = _sanitize(hebrewText || '');
  if (!safeText) throw new Error('טקסט ריק');

  const prompt = `אתה עוזר בניתוח תוכניות חזרה מרווחת.
המשתמש תיאר בעברית חופשית תוכנית חזרה. המר את התיאור למערך JSON של מספרים שלמים חיוביים (מספר ימים עד כל חזרה מיום הלימוד הראשון).

תיאור המשתמש: "${safeText}"

דוגמאות:
- "חזרה אחרי יום, שבוע, חודש" → [1, 7, 30]
- "כל שבועיים" → [14]
- "יום, יומיים, שבוע, חודש, שלושה חודשים" → [1, 2, 7, 30, 90]
- "חזרה אחרי יומיים, ואז אחרי שבועיים, ואז כל חודש" → [2, 14, 30]

ענה אך ורק ב-JSON תקין: [מספר, מספר, ...] — ללא שום טקסט נוסף.`;

  const raw = await _callGemini(prompt, 'general');
  const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  let arr;
  try { arr = JSON.parse(jsonStr); } catch { throw new Error('ה-AI לא הצליח לפרש את הטקסט. נסה ניסוח אחר.'); }
  if (!Array.isArray(arr) || !arr.length || arr.some(n => !Number.isInteger(n) || n < 1)) {
    throw new Error('ה-AI החזיר רצף לא תקין. בדוק את הניסוח ונסה שנית.');
  }
  return arr;
}

// ─── Suggest single question ─────────────────────────────────────────────────

async function suggestSingleQuestion({ summaryPath, summaryTitle, type }) {
  if (!summaryPath) throw new Error('נתיב הסיכום נדרש');

  let content = '';
  try {
    const { summariesRoot } = require('./filesController');
    const summaryDir = path.join(summariesRoot, summaryPath);
    const txtFile  = path.join(summaryDir, 'content.txt');
    const htmlFile = path.join(summaryDir, 'content.html');

    let raw = '';
    if (fs.existsSync(txtFile)) {
      raw = fs.readFileSync(txtFile, 'utf-8');
    } else if (fs.existsSync(htmlFile)) {
      raw = fs.readFileSync(htmlFile, 'utf-8');
    }

    // Strip ALL HTML tags thoroughly (content.txt stores innerHTML which is HTML)
    if (raw) {
      content = raw
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
        .replace(/\s{2,}/g, ' ')
        .trim();
    }
  } catch { /* content stays empty */ }

  const safeTitle   = _sanitize(summaryTitle || summaryPath);
  const safeContent = _sanitize(content).slice(0, 3000);

  const _parseJson = (raw) => {
    const s = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    return JSON.parse(s);
  };

  const GROUNDING = `[הגבלה קפדנית] בסס את השאלה והתשובה אך ורק על הטקסט המצוטט תחת CONTEXT להלן. אל תשתמש בידע חיצוני שאינו מופיע במפורש ב-CONTEXT. אם ה-CONTEXT דל — צור שאלה על מה שכתוב, אל תמציא מידע.`;

  const contextBlock = safeContent
    ? `\n\n=== CONTEXT: תוכן הסיכום ===\n${safeContent}\n=== סוף CONTEXT ===`
    : '\n\n=== CONTEXT: (אין תוכן — צור שאלה כללית על הכותרת) ===';

  if (type === 'mc') {
    const prompt = `${GROUNDING}
אתה מסייע לימודי. בהינתן סיכום הלמידה הבא, צור שאלת בחירה מרובה אחת עם 4 אפשרויות תשובה — כולן מבוססות אך ורק על ה-CONTEXT.
החזר JSON בלבד ללא כל טקסט נוסף, בפורמט המדויק:
{"question":"השאלה כאן","options":["אפשרות 1","אפשרות 2","אפשרות 3","אפשרות 4"],"correct_option_index":0}

כותרת הסיכום: ${safeTitle}${contextBlock}`;

    const raw  = await _callGemini(prompt, 'quiz');
    const json = _parseJson(raw);
    if (!json.question || !Array.isArray(json.options) || json.options.length < 2) {
      throw new Error('תשובת ה-AI אינה בפורמט הנכון');
    }
    return {
      question:             json.question,
      options:              json.options.slice(0, 4),
      correct_option_index: typeof json.correct_option_index === 'number' ? json.correct_option_index : 0,
    };
  } else {
    const prompt = `${GROUNDING}
אתה מסייע לימודי. בהינתן סיכום הלמידה הבא, צור שאלה פתוחה אחת ותשובה מפורטת לה — שניהם מבוססים אך ורק על ה-CONTEXT.
החזר JSON בלבד ללא כל טקסט נוסף, בפורמט המדויק:
{"question":"השאלה כאן","answer":"התשובה המפורטת כאן"}

כותרת הסיכום: ${safeTitle}${contextBlock}`;

    const raw  = await _callGemini(prompt, 'quiz');
    const json = _parseJson(raw);
    if (!json.question) throw new Error('תשובת ה-AI אינה בפורמט הנכון');
    return { question: json.question, answer: json.answer || '' };
  }
}

// ─── Grade open answer ────────────────────────────────────────────────────────

async function gradeAnswer({ question, sampleAnswer, userAnswer, strictness }) {
  if (!question) throw new Error('שאלה נדרשת');
  if (!userAnswer || !userAnswer.trim()) throw new Error('יש להזין תשובה לפני הגשה');

  const STRICTNESS_PROMPT = {
    'קלה':     'הערך בסלחנות. תן ניקוד גבוה גם על הבנה חלקית ועל כל התייחסות ענינית לנושא.',
    'בינונית': 'הערך בצדק. תן ניקוד גבוה על הבנת הרעיון המרכזי גם אם הניסוח אינו מדויק.',
    'קפדנית':  'הערך בקפדנות. דרוש דיוק במינוח ובכיסוי מלא של כל חלקי התשובה.',
  };
  const strictInstruction = STRICTNESS_PROMPT[strictness] || STRICTNESS_PROMPT['בינונית'];

  const safeQ    = _sanitize(question).slice(0, 500);
  const safeSamp = _sanitize(sampleAnswer || '').slice(0, 1000);
  const safeUser = _sanitize(userAnswer).slice(0, 1000);

  const prompt = `אתה בוחן לימודי. הערך את תשובת המשתמש ביחס לשאלה ולתשובה המצופה.
${strictInstruction}

כללי ביקורת חובה:
- אם נושא מרכזי לא הוזכר כלל בתשובת המשתמש — ציין במפורש: "התשובה לא התייחסה כלל לנושא [שם הנושא]".
- אם נושא כוסה באופן חלקי — פרט את תת-הנושאים הספציפיים החסרים מתוך התשובה המצופה.
- אל תחזור בביקורת על מה שנאמר נכון — התמקד רק בחסרים.

שאלה: ${safeQ}
תשובה מצופה: ${safeSamp || '(לא סופקה תשובה מודגמת — הערך לפי הגיון הנושא)'}
תשובת המשתמש: ${safeUser}

החזר JSON בלבד ללא כל טקסט נוסף, בפורמט המדויק:
{"score":75,"critique":"ביקורת ממוקדת בעברית עד 3 משפטים"}

score הוא מספר שלם בין 0 ל-100.`;

  const raw  = await _callGemini(prompt, 'quiz');
  const s    = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const json = JSON.parse(s);
  const score = Math.max(0, Math.min(100, Math.round(Number(json.score) || 0)));
  return { score, critique: json.critique || '' };
}

// ─── System help chat ────────────────────────────────────────────────────────

const SYSTEM_GUIDE = `מדריך למשתמש — מערכת למידה פעילה:

1. מסך ראשי: לוח שנה עברי-לועזי עם משימות חזרה יומיות. לחץ על יום לצפייה במשימות.
2. עיון בקבצים: ניהול עץ סיכומים — תיקיות וסיכומים. יצירה, עריכה, מחיקה, חיפוש.
3. עורך סיכום: עורך עשיר עם 3 עמודות — הקלטות שמע, עריכה, מסייע AI. שמירה אוטומטית.
4. שאלות ובחינה: עורך שאלות פתוחות ורב-ברירה דרך כפתור "📝 שאלות". בחינה עצמית דרך "🎯 בחן".
5. למידה פעילה: צ'אט עם ספריית מאמרים בנושא שיטות לימוד. יצירת תוכנית לימוד אישית.
6. מאגר ספרים: העלאת קבצי PDF/Word/PowerPoint לשימוש כהקשר ל-AI.
7. הגדרות: קביעת אלגוריתם חזרה מרווחת, מפתחות API, תצוגת לוח שנה, גיבוי.
8. חזרה מרווחת: תזמן סיכום ע"י לחיצה על "📅 תזמן" בתפריט הפריט. האלגוריתם קובע מתי תחזור.
9. ייצוא Word: כפתור "📄 Word" בעורך מייצא לקובץ .docx עם RTL עברי.
10. גיבוי: ייצוא ZIP של כל הסיכומים, ייבוא מגיבוי — בהגדרות → גיבוי ותחזוקה.
11. מצב אופליין: כל פונקציות הסיכומים עובדות ללא אינטרנט. רק ה-AI דורש חיבור.
12. מפתחות Gemini: הוסף מפתחות חינמיים מ-aistudio.google.com בהגדרות → מפתחות API.`;

async function systemHelpChat(userMessage) {
  const safeMsg = _sanitize(userMessage);
  if (!safeMsg) throw new Error('הודעה ריקה');
  const prompt = `אתה עוזר תמיכה למשתמש במערכת למידה פעילה.
ענה אך ורק על בסיס מדריך המשתמש הבא. אל תמציא מידע שאינו במדריך.
אם השאלה אינה קשורה למערכת — ענה: "שאלה זו אינה קשורה למערכת הלמידה. אוכל לעזור בכל שאלה הנוגעת לשימוש במערכת."

מדריך המשתמש:
${SYSTEM_GUIDE}

שאלת המשתמש: ${safeMsg}

ענה בעברית, בצורה ידידותית וקצרה (עד 5 משפטים).`;
  return await _callGemini(prompt, 'general');
}

// ─── Appeal grade ────────────────────────────────────────────────────────────

async function appealGrade({ question, sampleAnswer, userAnswer, originalCritique, originalScore, appealArgument }) {
  if (!question) throw new Error('שאלה נדרשת');
  if (!appealArgument || !appealArgument.trim()) throw new Error('טיעון הערעור נדרש');

  const safeQ    = _sanitize(question).slice(0, 500);
  const safeSamp = _sanitize(sampleAnswer || '').slice(0, 1000);
  const safeUser = _sanitize(userAnswer || '').slice(0, 1000);
  const safeCrit = _sanitize(originalCritique || '').slice(0, 600);
  const safeArg  = _sanitize(appealArgument).slice(0, 800);
  const origScore = Math.max(0, Math.min(100, Math.round(Number(originalScore) || 0)));

  const prompt = `אתה פרופסור אקדמי הוגן. סטודנט ערער על הציון שקיבל בשאלה פתוחה. עיין בכל הנתונים ובטיעון הסטודנט, ועדכן את הציון אם הערעור מוצדק.

שאלה: ${safeQ}
תשובה מצופה: ${safeSamp || '(לא סופקה)'}
תשובת הסטודנט: ${safeUser}
ביקורת מקורית: ${safeCrit || '(לא סופקה)'}
ציון מקורי: ${origScore}/100
טיעון הסטודנט לערעור: ${safeArg}

הנחיות:
- אם הטיעון מוצדק — העלה את הציון בהתאם.
- אם הטיעון אינו מוצדק — שמור על הציון המקורי.
- ציין בביקורת המעודכנת האם הערעור התקבל ומדוע.

החזר JSON בלבד ללא כל טקסט נוסף, בפורמט המדויק:
{"newScore":75,"newCritique":"ביקורת מעודכנת בעברית עד 3 משפטים"}

newScore הוא מספר שלם בין 0 ל-100.`;

  const raw  = await _callGemini(prompt, 'quiz');
  const s    = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const json = JSON.parse(s);
  return {
    newScore:    Math.max(0, Math.min(100, Math.round(Number(json.newScore) || 0))),
    newCritique: json.newCritique || '',
  };
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
  suggestSingleQuestion,
  gradeAnswer,
  appealGrade,
  getScheduleAdvice,
  chatWithArticles,
  generateLearningProgram,
  parseSrProgramFromText,
  systemHelpChat,
  getKeyStatus,
  getKeys,
  updateKeys,
  getLbMode,
  setLbMode,
};
