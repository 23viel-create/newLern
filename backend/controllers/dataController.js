const fs   = require('fs');
const path = require('path');

const DATA_ROOT = process.env.APP_DATA_DIR || path.join(__dirname, '../../data');

function _rmrf(target) {
  if (!fs.existsSync(target)) return;
  const stat = fs.statSync(target);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(target)) {
      _rmrf(path.join(target, entry));
    }
    fs.rmdirSync(target);
  } else {
    fs.unlinkSync(target);
  }
}

// DELETE /api/data/reset-notes
async function resetNotes(req, res) {
  try {
    const notesFile = path.join(DATA_ROOT, 'notes.json');
    if (fs.existsSync(notesFile)) fs.unlinkSync(notesFile);
    res.json({ success: true, message: 'כל הפתקיות נמחקו בהצלחה' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// DELETE /api/data/reset-schedule
async function resetSchedule(req, res) {
  try {
    const scheduleFile = path.join(DATA_ROOT, 'schedule.json');
    const pathsFile    = path.join(DATA_ROOT, 'study_paths.json');
    if (fs.existsSync(scheduleFile)) fs.unlinkSync(scheduleFile);
    if (fs.existsSync(pathsFile))    fs.unlinkSync(pathsFile);
    res.json({ success: true, message: 'לוח הזמנים ומסלולי הלמידה נמחקו בהצלחה' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// DELETE /api/data/reset-summaries
async function resetSummaries(req, res) {
  try {
    const summariesDir = path.join(DATA_ROOT, 'summaries_tree');
    _rmrf(summariesDir);
    fs.mkdirSync(path.join(summariesDir, 'root'), { recursive: true });
    res.json({ success: true, message: 'כל הסיכומים נמחקו ומבנה הספרייה אופס' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

// DELETE /api/data/reset-all
async function resetAll(req, res) {
  try {
    const targets = [
      path.join(DATA_ROOT, 'notes.json'),
      path.join(DATA_ROOT, 'schedule.json'),
      path.join(DATA_ROOT, 'study_paths.json'),
      path.join(DATA_ROOT, 'quiz_history.json'),
    ];
    for (const t of targets) {
      if (fs.existsSync(t)) fs.unlinkSync(t);
    }

    const dirsToWipe = ['summaries_tree', 'articles', 'backups', 'books'];
    for (const d of dirsToWipe) {
      _rmrf(path.join(DATA_ROOT, d));
    }

    // Re-scaffold required directories
    fs.mkdirSync(path.join(DATA_ROOT, 'summaries_tree', 'root'), { recursive: true });
    fs.mkdirSync(path.join(DATA_ROOT, 'articles'),  { recursive: true });
    fs.mkdirSync(path.join(DATA_ROOT, 'backups'),   { recursive: true });
    fs.mkdirSync(path.join(DATA_ROOT, 'books'),     { recursive: true });

    res.json({ success: true, message: 'כל הנתונים נמחקו ומבנה המערכת אופס' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = { resetNotes, resetSchedule, resetSummaries, resetAll };
