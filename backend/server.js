// Bypass corporate/kosher TLS filters (Rimon, NetSpark) for local Gemini API calls
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const summariesRouter     = require('./routes/summaries');
const quizzesRouter       = require('./routes/quizzes');
const scheduleRouter      = require('./routes/schedule');
const aiRouter            = require('./routes/ai');
const backupRouter        = require('./routes/backup');
const booksRouter         = require('./routes/books');
const calendarRouter      = require('./routes/calendar');
const learningPlansRouter = require('./routes/learningPlans');
const notesRouter         = require('./routes/notes');
const chatRouter          = require('./routes/chat');
const dataRouter          = require('./routes/data');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware ---
app.use(cors({ origin: `http://localhost:${PORT}` }));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../frontend')));

// --- API Routes ---
app.use('/api/summaries', summariesRouter);
app.use('/api/quizzes', quizzesRouter);
app.use('/api/schedule', scheduleRouter);
app.use('/api/ai',      aiRouter);
app.use('/api/backup',  backupRouter);
app.use('/api/books',          booksRouter);
app.use('/api/calendar',       calendarRouter);
app.use('/api/learning-plans', learningPlansRouter);
app.use('/api/notes',          notesRouter);
app.use('/api/chat',           chatRouter);
app.use('/api/data',           dataRouter);

// בדיקת תקינות השרת
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', message: 'השרת פועל תקין', timestamp: new Date().toISOString() });
});

// כל בקשה אחרת מוגשת על ידי ה-frontend
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.listen(PORT, () => {
  console.log(`✅  השרת פועל בכתובת: http://localhost:${PORT}`);
});
