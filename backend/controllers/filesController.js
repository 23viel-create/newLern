const fs = require('fs');
const path = require('path');
const { SUMMARIES_DIR } = require('../config/limits');

const summariesRoot = path.resolve(__dirname, SUMMARIES_DIR, 'root');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function getSummaryPath(summaryId) {
  return path.join(summariesRoot, summaryId);
}

function listSummaries(parentId = '') {
  const targetDir = parentId
    ? path.join(summariesRoot, parentId)
    : summariesRoot;
  if (!fs.existsSync(targetDir)) return [];
  return fs.readdirSync(targetDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

function createSummaryDir(summaryId) {
  const summaryPath = getSummaryPath(summaryId);
  ensureDir(summaryPath);
  // קבצי ברירת מחדל
  const meta = { id: summaryId, title: summaryId, createdAt: new Date().toISOString() };
  fs.writeFileSync(path.join(summaryPath, 'meta.json'), JSON.stringify(meta, null, 2));
  fs.writeFileSync(path.join(summaryPath, 'open_questions.json'), JSON.stringify([], null, 2));
  fs.writeFileSync(path.join(summaryPath, 'multiple_choice.json'), JSON.stringify([], null, 2));
  return summaryPath;
}

function deleteSummaryDir(summaryId) {
  const summaryPath = getSummaryPath(summaryId);
  if (!fs.existsSync(summaryPath)) throw new Error('סיכום לא נמצא');
  fs.rmSync(summaryPath, { recursive: true, force: true });
}

module.exports = { listSummaries, createSummaryDir, deleteSummaryDir, getSummaryPath };
