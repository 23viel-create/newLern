const fs   = require('fs');
const path = require('path');
const { SUMMARIES_DIR } = require('../config/limits');

const summariesRoot = path.resolve(__dirname, SUMMARIES_DIR, 'root');

// ─── helpers ──────────────────────────────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/** Resolve a relative path and guarantee it stays inside summariesRoot. */
function safePath(relPath) {
  const resolved = path.resolve(summariesRoot, relPath || '');
  if (resolved !== summariesRoot && !resolved.startsWith(summariesRoot + path.sep)) {
    throw new Error('נתיב לא חוקי');
  }
  return resolved;
}

/** Basic name validation — no path traversal, no separators. */
function validateName(name) {
  if (!name || typeof name !== 'string') throw new Error('שם לא תקין');
  const t = name.trim();
  if (!t)        throw new Error('שם לא יכול להיות ריק');
  if (t.length > 100) throw new Error('שם ארוך מדי (מקסימום 100 תווים)');
  if (/[/\\]/.test(t)) throw new Error('שם לא יכול להכיל / או \\\\');
  if (t === '.' || t === '..') throw new Error('שם לא חוקי');
  return t;
}

function readMeta(nodePath) {
  const metaFile = path.join(nodePath, 'meta.json');
  if (!fs.existsSync(metaFile)) {
    const stat = fs.statSync(nodePath);
    // Heuristic for nodes created before Phase 2
    const hasSummaryFiles =
      fs.existsSync(path.join(nodePath, 'content.txt')) ||
      fs.existsSync(path.join(nodePath, 'questions_open.json'));
    return {
      title: path.basename(nodePath),
      type: hasSummaryFiles ? 'summary' : 'folder',
      createdAt: stat.birthtime.toISOString(),
      updatedAt: stat.mtime.toISOString(),
    };
  }
  try {
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf-8'));
    // Back-fill type if missing (Phase 1 nodes had no type field)
    if (!meta.type) {
      meta.type = fs.existsSync(path.join(nodePath, 'content.txt')) ||
                  fs.existsSync(path.join(nodePath, 'questions_open.json'))
        ? 'summary' : 'folder';
    }
    return meta;
  } catch {
    return { title: path.basename(nodePath), type: 'folder' };
  }
}

function writeMeta(nodePath, meta) {
  fs.writeFileSync(path.join(nodePath, 'meta.json'), JSON.stringify(meta, null, 2));
}

// ─── tree read ────────────────────────────────────────────────────────────────

function readTree(dirPath, relBase) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const nodes   = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const absPath = path.join(dirPath, entry.name);
    const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;
    const meta    = readMeta(absPath);
    const stat    = fs.statSync(absPath);

    const node = {
      name:      entry.name,
      title:     meta.title || entry.name,
      type:      meta.type,
      path:      relPath,
      createdAt: meta.createdAt || stat.birthtime.toISOString(),
      updatedAt: meta.updatedAt || stat.mtime.toISOString(),
    };

    if (node.type === 'folder') {
      node.children = readTree(absPath, relPath);
    }

    nodes.push(node);
  }

  return nodes;
}

function getFullTree() {
  ensureDir(summariesRoot);
  return readTree(summariesRoot, '');
}

// ─── mutations ────────────────────────────────────────────────────────────────

function createFolder(parentRelPath, rawName) {
  const name       = validateName(rawName);
  const parentPath = safePath(parentRelPath);
  if (!fs.existsSync(parentPath)) throw new Error('תיקיית הורה לא נמצאה');

  const folderPath = path.join(parentPath, name);
  if (fs.existsSync(folderPath)) throw new Error('תיקייה בשם זה כבר קיימת');

  ensureDir(folderPath);
  const now  = new Date().toISOString();
  const meta = { title: name, type: 'folder', createdAt: now, updatedAt: now };
  writeMeta(folderPath, meta);

  const relPath = parentRelPath ? `${parentRelPath}/${name}` : name;
  return { name, title: name, type: 'folder', path: relPath, ...meta, children: [] };
}

function createSummary(parentRelPath, rawName) {
  const name       = validateName(rawName);
  const parentPath = safePath(parentRelPath);
  if (!fs.existsSync(parentPath)) throw new Error('תיקיית הורה לא נמצאה');

  const summaryPath = path.join(parentPath, name);
  if (fs.existsSync(summaryPath)) throw new Error('סיכום בשם זה כבר קיים');

  ensureDir(summaryPath);
  const now  = new Date().toISOString();
  const meta = { title: name, type: 'summary', createdAt: now, updatedAt: now };
  writeMeta(summaryPath, meta);

  fs.writeFileSync(path.join(summaryPath, 'content.txt'), '');
  fs.writeFileSync(
    path.join(summaryPath, 'questions_open.json'),
    JSON.stringify([], null, 2),
  );
  fs.writeFileSync(
    path.join(summaryPath, 'questions_mc.json'),
    JSON.stringify([], null, 2),
  );

  const relPath = parentRelPath ? `${parentRelPath}/${name}` : name;
  return { name, title: name, type: 'summary', path: relPath, ...meta };
}

function renameNode(nodeRelPath, rawNewName) {
  if (!nodeRelPath) throw new Error('אי אפשר לשנות שם לתיקיית השורש');
  const newName  = validateName(rawNewName);
  const oldAbsPath = safePath(nodeRelPath);
  if (!fs.existsSync(oldAbsPath)) throw new Error('הפריט לא נמצא');

  const parentDir  = path.dirname(oldAbsPath);
  const newAbsPath = path.join(parentDir, newName);
  if (fs.existsSync(newAbsPath)) throw new Error('כבר קיים פריט עם שם זה');

  fs.renameSync(oldAbsPath, newAbsPath);

  const meta     = readMeta(newAbsPath);
  meta.title     = newName;
  meta.updatedAt = new Date().toISOString();
  writeMeta(newAbsPath, meta);

  const parentRel = path.dirname(nodeRelPath);
  const newRelPath = parentRel === '.' ? newName : `${parentRel}/${newName}`;
  return { ...meta, name: newName, path: newRelPath };
}

function deleteNode(nodeRelPath) {
  if (!nodeRelPath) throw new Error('אי אפשר למחוק את תיקיית השורש');
  const nodePath = safePath(nodeRelPath);
  if (!fs.existsSync(nodePath)) throw new Error('הפריט לא נמצא');
  fs.rmSync(nodePath, { recursive: true, force: true });
}

// ─── content read/write (used by future phases) ───────────────────────────────

function getSummaryContent(nodeRelPath) {
  const contentPath = path.join(safePath(nodeRelPath), 'content.txt');
  if (!fs.existsSync(contentPath)) throw new Error('קובץ תוכן לא נמצא');
  return fs.readFileSync(contentPath, 'utf-8');
}

function setSummaryContent(nodeRelPath, text) {
  const nodePath = safePath(nodeRelPath);
  if (!fs.existsSync(nodePath)) throw new Error('הסיכום לא נמצא');
  fs.writeFileSync(path.join(nodePath, 'content.txt'), text || '', 'utf-8');
  // Bump updatedAt
  const meta = readMeta(nodePath);
  meta.updatedAt = new Date().toISOString();
  writeMeta(nodePath, meta);
}

module.exports = {
  getFullTree,
  createFolder,
  createSummary,
  renameNode,
  deleteNode,
  getSummaryContent,
  setSummaryContent,
};
