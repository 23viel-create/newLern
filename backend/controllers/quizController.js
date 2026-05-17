'use strict';
const fs   = require('fs');
const path = require('path');
const { SUMMARIES_DIR, SCHEDULE_FILE } = require('../config/limits');

const summariesRoot = path.resolve(__dirname, SUMMARIES_DIR, 'root');
const scheduleFile  = path.resolve(__dirname, SCHEDULE_FILE);

// ── Security ──────────────────────────────────────────────────────────────────

function safePath(relPath) {
  const resolved = path.resolve(summariesRoot, relPath || '');
  if (resolved !== summariesRoot && !resolved.startsWith(summariesRoot + path.sep)) {
    throw new Error('נתיב לא חוקי');
  }
  return resolved;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

let _seq = 0;
function genId() {
  return `${Date.now()}-${(++_seq).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function readMeta(absPath) {
  const mf = path.join(absPath, 'meta.json');
  if (!fs.existsSync(mf)) {
    return {
      title: path.basename(absPath),
      type: fs.existsSync(path.join(absPath, 'content.txt')) ? 'summary' : 'folder',
    };
  }
  try {
    const m = JSON.parse(fs.readFileSync(mf, 'utf-8'));
    if (!m.type) m.type = fs.existsSync(path.join(absPath, 'content.txt')) ? 'summary' : 'folder';
    return m;
  } catch {
    return { title: path.basename(absPath), type: 'folder' };
  }
}

function qFilePath(nodeRelPath, type) {
  const dir = safePath(nodeRelPath);
  return path.join(dir, type === 'open' ? 'questions_open.json' : 'questions_mc.json');
}

function readQs(nodeRelPath, type) {
  const file = qFilePath(nodeRelPath, type);
  if (!fs.existsSync(file)) return [];
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')) || []; } catch { return []; }
}

function writeQs(nodeRelPath, type, questions) {
  fs.writeFileSync(qFilePath(nodeRelPath, type), JSON.stringify(questions, null, 2));
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

function getQuestions(nodeRelPath) {
  // Verify path exists and is a summary
  const abs = safePath(nodeRelPath);
  if (!fs.existsSync(abs)) throw new Error('סיכום לא נמצא');
  return {
    open: readQs(nodeRelPath, 'open'),
    mc:   readQs(nodeRelPath, 'mc'),
  };
}

function addQuestion(nodeRelPath, type, data) {
  const now = new Date().toISOString();
  const qs  = readQs(nodeRelPath, type);
  const q   = { id: genId(), ...data, success_rate: null, createdAt: now, updatedAt: now };
  qs.push(q);
  writeQs(nodeRelPath, type, qs);
  return q;
}

function updateQuestion(nodeRelPath, type, id, data) {
  const qs  = readQs(nodeRelPath, type);
  const idx = qs.findIndex(q => q.id === id);
  if (idx === -1) throw new Error('שאלה לא נמצאה');
  qs[idx] = { ...qs[idx], ...data, id, updatedAt: new Date().toISOString() };
  writeQs(nodeRelPath, type, qs);
  return qs[idx];
}

function deleteQuestion(nodeRelPath, type, id) {
  const qs = readQs(nodeRelPath, type);
  const next = qs.filter(q => q.id !== id);
  if (next.length === qs.length) throw new Error('שאלה לא נמצאה');
  writeQs(nodeRelPath, type, next);
}

// ── Bundle ────────────────────────────────────────────────────────────────────

function _collectFromPath(relPath) {
  let abs;
  try { abs = safePath(relPath); } catch { return []; }
  if (!fs.existsSync(abs)) return [];

  const meta = readMeta(abs);
  const all  = [];

  if (meta.type === 'summary') {
    const opens = readQs(relPath, 'open').map(q => ({ ...q, qtype: 'open', summaryPath: relPath, summaryTitle: meta.title }));
    const mcs   = readQs(relPath, 'mc'  ).map(q => ({ ...q, qtype: 'mc',   summaryPath: relPath, summaryTitle: meta.title }));
    all.push(...opens, ...mcs);
  } else {
    // Folder — recurse into subdirs
    const entries = fs.readdirSync(abs, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory()) {
        all.push(..._collectFromPath(relPath ? `${relPath}/${e.name}` : e.name));
      }
    }
  }
  return all;
}

function getBundle(paths) {
  const all = [];
  for (const p of paths) all.push(..._collectFromPath(p));
  // Fisher-Yates shuffle
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all;
}

// ── Submit ────────────────────────────────────────────────────────────────────

function submitResult(summaryPath, totalScore, questionResults) {
  // Update per-question success_rate (grouped by summaryPath+type)
  const byPath = {};
  for (const r of questionResults) {
    const key = `${r.summaryPath}|${r.qtype}`;
    if (!byPath[key]) byPath[key] = [];
    byPath[key].push(r);
  }

  for (const key of Object.keys(byPath)) {
    const [sp, qtype] = key.split('|');
    const qs = readQs(sp, qtype);
    for (const r of byPath[key]) {
      const q = qs.find(q => q.id === r.id);
      if (!q || r.score == null) continue;
      q.success_rate = q.success_rate == null
        ? r.score
        : Math.round(((q.success_rate + r.score) / 2) * 100) / 100;
      q.updatedAt = new Date().toISOString();
    }
    writeQs(sp, qtype, qs);
  }

  // SR rescheduling per unique summaryPath that had poor scores
  const pathScores = {};
  for (const r of questionResults) {
    if (!pathScores[r.summaryPath]) pathScores[r.summaryPath] = { sum: 0, count: 0 };
    if (r.score != null) {
      pathScores[r.summaryPath].sum   += r.score;
      pathScores[r.summaryPath].count += 1;
    }
  }

  for (const [sp, { sum, count }] of Object.entries(pathScores)) {
    if (!count) continue;
    const pathScore = sum / count;
    if (pathScore < 0.7) _rescheduleEarly(sp, pathScore);
  }
}

function _rescheduleEarly(summaryPath, score) {
  if (!fs.existsSync(scheduleFile)) return;
  let schedule;
  try { schedule = JSON.parse(fs.readFileSync(scheduleFile, 'utf-8')); } catch { return; }

  const today    = new Date().toISOString().split('T')[0];
  const tomorrow = _addDays(today, 1);
  let changed = false;

  for (const task of schedule.tasks) {
    if (task.summaryPath === summaryPath && !task.completed && task.dueDate > today) {
      task.dueDate             = tomorrow;
      task.rescheduledByScore  = score;
      changed = true;
      break; // only the nearest upcoming task
    }
  }

  if (changed) fs.writeFileSync(scheduleFile, JSON.stringify(schedule, null, 2));
}

function _addDays(dateStr, n) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, mo - 1, d);
  dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
}

module.exports = { getQuestions, addQuestion, updateQuestion, deleteQuestion, getBundle, submitResult };
