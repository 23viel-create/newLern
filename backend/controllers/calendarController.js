'use strict';
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getNextKey, recordUsage, recordError, recordQuotaExhausted } = require('../config/gemini');

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
    if (msg.includes('429') || /quota/i.test(msg)) { recordQuotaExhausted(key); }
    else recordError(key);
    throw err;
  }
}

// POST /api/calendar/extend-parashot — AI validates / extends parasha dictionary
async function extendParashot(req, res) {
  try {
    const prompt = `אתה מומחה בלוח השנה העברי ובפרשיות השבוע (מחזור ישראל).
עליך להפיק טבלת פרשיות שבוע מלאה לשנים 5788–5800 (2027–2040) כמחזור ישראל.

כללים:
• מחזור ישראל בלבד (לא גולה).
• פרשיות כפולות לפי דרישת השנה (ויקהל-פקודי, תזריע-מצורע, אחרי מות-קדושים, בהר-בחוקותי, מטות-מסעי, ניצבים-וילך).
• שבת חול המועד פסח: "חוה\\"מ פסח". שבת חול המועד סוכות: "חוה\\"מ סוכות".
• המפתח = תאריך ISO של יום שבת (שבת). הערך = שם הפרשה.

ענה ב-JSON בלבד, ללא שום טקסט אחר:
{"YYYY-MM-DD":"שם פרשה", ...}`;

    const raw = await _callGemini(prompt);
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    let extended;
    try { extended = JSON.parse(jsonStr); }
    catch { return res.status(500).json({ success: false, message: 'תגובת ה-AI אינה JSON תקין. נסה שנית.' }); }

    const validEntries = Object.entries(extended).filter(([k, v]) =>
      /^\d{4}-\d{2}-\d{2}$/.test(k) && typeof v === 'string' && v.trim()
    );

    res.json({
      success: true,
      data: { count: validEntries.length, entries: Object.fromEntries(validEntries) },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = { extendParashot };
