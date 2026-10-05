const fs   = require('fs');
const path = require('path');
const { SUMMARIES_DIR } = require('../config/limits');

const summariesRoot = path.join(SUMMARIES_DIR, 'root');

// ─── helpers ──────────────────────────────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function safePath(relPath) {
  const resolved = path.resolve(summariesRoot, relPath || '');
  if (resolved !== summariesRoot && !resolved.startsWith(summariesRoot + path.sep)) {
    throw new Error('נתיב לא חוקי');
  }
  return resolved;
}

function validateName(name) {
  if (!name || typeof name !== 'string') throw new Error('שם לא תקין');
  const t = name.trim();
  if (!t)          throw new Error('שם לא יכול להיות ריק');
  if (t.length > 100) throw new Error('שם ארוך מדי (מקסימום 100 תווים)');
  if (/[/\\]/.test(t)) throw new Error('שם לא יכול להכיל / או \\\\');
  if (t === '.' || t === '..') throw new Error('שם לא חוקי');
  return t;
}

function readMeta(nodePath) {
  const metaFile = path.join(nodePath, 'meta.json');
  if (!fs.existsSync(metaFile)) {
    const stat = fs.statSync(nodePath);
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
  if (fs.existsSync(folderPath) && fs.statSync(folderPath).isDirectory()) {
    throw new Error('תיקייה בשם זה כבר קיימת');
  }

  ensureDir(folderPath);
  const now  = new Date().toISOString();
  const meta = { title: name, type: 'folder', createdAt: now, updatedAt: now };
  writeMeta(folderPath, meta);

  const relPath = parentRelPath ? `${parentRelPath}/${name}` : name;
  return { name, title: name, type: 'folder', path: relPath, ...meta, children: [] };
}

function createSummary(parentRelPath, rawName) {
  const name        = validateName(rawName);
  const parentPath  = safePath(parentRelPath);
  if (!fs.existsSync(parentPath)) throw new Error('תיקיית הורה לא נמצאה');

  const summaryPath = path.join(parentPath, name);
  if (fs.existsSync(summaryPath) && fs.statSync(summaryPath).isDirectory()) {
    throw new Error('סיכום בשם זה כבר קיים');
  }

  ensureDir(summaryPath);
  const now  = new Date().toISOString();
  const meta = { title: name, type: 'summary', createdAt: now, updatedAt: now };
  writeMeta(summaryPath, meta);

  fs.writeFileSync(path.join(summaryPath, 'content.txt'), '');
  fs.writeFileSync(path.join(summaryPath, 'questions_open.json'), JSON.stringify([], null, 2));
  fs.writeFileSync(path.join(summaryPath, 'questions_mc.json'),   JSON.stringify([], null, 2));

  const relPath = parentRelPath ? `${parentRelPath}/${name}` : name;
  return { name, title: name, type: 'summary', path: relPath, ...meta };
}

function renameNode(nodeRelPath, rawNewName) {
  if (!nodeRelPath) throw new Error('אי אפשר לשנות שם לתיקיית השורש');
  const newName    = validateName(rawNewName);
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

  const parentRel  = path.dirname(nodeRelPath);
  const newRelPath = parentRel === '.' ? newName : `${parentRel}/${newName}`;
  return { ...meta, name: newName, path: newRelPath };
}

function deleteNode(nodeRelPath) {
  if (!nodeRelPath) throw new Error('אי אפשר למחוק את תיקיית השורש');
  const nodePath = safePath(nodeRelPath);
  if (!fs.existsSync(nodePath)) throw new Error('הפריט לא נמצא');
  fs.rmSync(nodePath, { recursive: true, force: true });
}

// ─── content read / write ────────────────────────────────────────────────────

function getSummaryContent(nodeRelPath) {
  const contentPath = path.join(safePath(nodeRelPath), 'content.txt');
  if (!fs.existsSync(contentPath)) return '';
  return fs.readFileSync(contentPath, 'utf-8');
}

const MAX_HISTORY = 5;

function _saveHistory(nodePath) {
  const contentPath = path.join(nodePath, 'content.txt');
  if (!fs.existsSync(contentPath)) return;
  const prev = fs.readFileSync(contentPath, 'utf-8');
  if (!prev.trim()) return;

  const histDir = path.join(nodePath, '.history');
  ensureDir(histDir);

  const histFile = path.join(histDir, 'versions.json');
  let versions = [];
  if (fs.existsSync(histFile)) {
    try { versions = JSON.parse(fs.readFileSync(histFile, 'utf-8')); } catch { versions = []; }
  }
  versions.unshift({ savedAt: new Date().toISOString(), content: prev });
  versions = versions.slice(0, MAX_HISTORY);
  fs.writeFileSync(histFile, JSON.stringify(versions, null, 2), 'utf-8');
}

function getSummaryHistory(nodeRelPath) {
  const nodePath  = safePath(nodeRelPath);
  const histFile  = path.join(nodePath, '.history', 'versions.json');
  if (!fs.existsSync(histFile)) return [];
  try {
    const versions = JSON.parse(fs.readFileSync(histFile, 'utf-8'));
    return versions.map((v, i) => ({ index: i, savedAt: v.savedAt, preview: v.content.slice(0, 120) }));
  } catch { return []; }
}

function restoreHistoryVersion(nodeRelPath, versionIndex) {
  const nodePath  = safePath(nodeRelPath);
  const histFile  = path.join(nodePath, '.history', 'versions.json');
  if (!fs.existsSync(histFile)) throw new Error('אין גרסאות קודמות');
  const versions = JSON.parse(fs.readFileSync(histFile, 'utf-8'));
  if (!versions[versionIndex]) throw new Error('גרסה לא נמצאה');
  _saveHistory(nodePath); // save current as history first
  setSummaryContent(nodeRelPath, versions[versionIndex].content);
  return versions[versionIndex].content;
}

function setSummaryContent(nodeRelPath, html) {
  const nodePath = safePath(nodeRelPath);
  if (!fs.existsSync(nodePath)) throw new Error('הסיכום לא נמצא');
  _saveHistory(nodePath);
  fs.writeFileSync(path.join(nodePath, 'content.txt'), html || '', 'utf-8');
  const meta     = readMeta(nodePath);
  meta.updatedAt = new Date().toISOString();
  writeMeta(nodePath, meta);
  // Keep document.docx mirror in sync (fire-and-forget, never blocks the save)
  setImmediate(() => _syncDocxMirror(nodePath, meta.title || path.basename(nodePath), html || ''));
}

function _syncDocxMirror(nodePath, title, html) {
  try {
    // Lazy require avoids a circular-dependency issue at module-load time
    const { buildDocx } = require('./backupController');
    buildDocx(title, html).then(buf => {
      fs.writeFileSync(path.join(nodePath, 'document.docx'), buf);
    }).catch(() => {});
  } catch { /* mirror is optional — never propagate */ }
}

// ─── audio management ────────────────────────────────────────────────────────

const AUDIO_EXTS = /\.(webm|mp3|wav|ogg|m4a|aac)$/i;

function audioDir(nodeRelPath) {
  return path.join(safePath(nodeRelPath), 'audio');
}

function listAudioFiles(nodeRelPath) {
  const dir = audioDir(nodeRelPath);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => AUDIO_EXTS.test(f))
    .map(f => {
      const stat = fs.statSync(path.join(dir, f));
      return {
        filename:   f,
        size:       stat.size,
        recordedAt: stat.birthtime.toISOString(),
      };
    })
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
}

function saveAudioBuffer(nodeRelPath, originalName, buffer) {
  const dir      = audioDir(nodeRelPath);
  ensureDir(dir);
  // Sanitise filename; keep extension
  const ext      = path.extname(originalName).toLowerCase() || '.webm';
  const base     = path.basename(originalName, ext).replace(/[^a-zA-Z0-9_֐-׿\-]/g, '_');
  const ts       = Date.now();
  const safeName = `${base}_${ts}${ext}`;
  fs.writeFileSync(path.join(dir, safeName), buffer);
  // Bump updatedAt
  const nodePath = safePath(nodeRelPath);
  const meta     = readMeta(nodePath);
  meta.updatedAt = new Date().toISOString();
  writeMeta(nodePath, meta);
  return safeName;
}

function deleteAudioFile(nodeRelPath, filename) {
  const safeName = path.basename(filename); // prevent traversal
  const filePath = path.join(audioDir(nodeRelPath), safeName);
  if (!fs.existsSync(filePath)) throw new Error('קובץ שמע לא נמצא');
  fs.unlinkSync(filePath);
}

function getAudioFilePath(nodeRelPath, filename) {
  const safeName = path.basename(filename);
  const filePath = path.join(audioDir(nodeRelPath), safeName);
  if (!fs.existsSync(filePath)) throw new Error('קובץ שמע לא נמצא');
  return filePath;
}

// ─── bulk import ─────────────────────────────────────────────────────────────

function bulkImport(parentRelPath, rawContent, delimiter, rawBaseName) {
  if (!rawContent || !rawContent.trim()) throw new Error('אין תוכן לייבוא');
  if (!delimiter)  throw new Error('נדרש מפריד');

  const baseName = (rawBaseName || 'סיכום').trim();
  const parts    = rawContent.split(delimiter).map(s => s.trim()).filter(Boolean);

  if (parts.length === 0) throw new Error('המפריד לא נמצא בתוכן');
  if (parts.length > 100) throw new Error('יותר מדי חלקים (מקסימום 100)');

  const parentPath = safePath(parentRelPath);
  if (!fs.existsSync(parentPath)) throw new Error('תיקיית הורה לא נמצאה');

  const created = [];
  for (let i = 0; i < parts.length; i++) {
    const desired  = validateName(`${baseName} ${i + 1}`);
    let   name     = desired;
    let   counter  = 2;
    while (fs.existsSync(path.join(parentPath, name))) {
      name = `${desired} (${counter++})`;
    }
    const node = createSummary(parentRelPath, name);
    setSummaryContent(node.path, parts[i]);
    created.push(node);
  }
  return created;
}

// ─── sequential navigation ────────────────────────────────────────────────────

function flattenSummaries(nodes) {
  const list = [];
  for (const n of nodes) {
    if (n.type === 'summary') list.push(n);
    else if (n.children)      list.push(...flattenSummaries(n.children));
  }
  return list;
}

function getNeighbors(nodeRelPath) {
  const tree = getFullTree();
  const flat  = flattenSummaries(tree);
  const idx   = flat.findIndex(n => n.path === nodeRelPath);
  if (idx === -1) return { prev: null, next: null };
  return {
    prev: idx > 0              ? flat[idx - 1] : null,
    next: idx < flat.length - 1 ? flat[idx + 1] : null,
  };
}

// ─── import external file into a folder ──────────────────────────────────────

function _extractDocxText(buffer) {
  try {
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(buffer);
    const xmlEntry = zip.getEntry('word/document.xml');
    if (!xmlEntry) return '';
    const xml = xmlEntry.getData().toString('utf-8');
    return xml
      .replace(/<w:p[ >]/g, '\n')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  } catch { return ''; }
}

function importFileToFolder(parentRelPath, filename, buffer, mimetype) {
  const parentPath = safePath(parentRelPath);
  if (!fs.existsSync(parentPath)) throw new Error('תיקיית יעד לא נמצאה');

  const ext      = path.extname(filename);
  const rawBase  = path.basename(filename, ext) || 'קובץ מיובא';
  let   name     = validateName(rawBase.slice(0, 80));

  // Resolve naming conflicts
  let finalName = name;
  let counter   = 1;
  while (fs.existsSync(path.join(parentPath, finalName))) {
    finalName = `${name} (${counter++})`;
  }

  const nodePath = path.join(parentPath, finalName);
  ensureDir(nodePath);
  const now  = new Date().toISOString();
  const meta = { title: finalName, type: 'summary', createdAt: now, updatedAt: now };
  writeMeta(nodePath, meta);

  let content = '';
  const isDocx = ext.toLowerCase() === '.docx' ||
    mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  if (isDocx) {
    content = _extractDocxText(buffer);
  }

  fs.writeFileSync(path.join(nodePath, 'content.txt'), content);
  fs.writeFileSync(path.join(nodePath, 'questions_open.json'), JSON.stringify([], null, 2));
  fs.writeFileSync(path.join(nodePath, 'questions_mc.json'),   JSON.stringify([], null, 2));

  // For audio files, save to audio subdirectory
  if (mimetype && mimetype.startsWith('audio/')) {
    const audioDir      = path.join(nodePath, 'audio');
    ensureDir(audioDir);
    const audioFilename = `imported_${Date.now()}${ext || '.audio'}`;
    fs.writeFileSync(path.join(audioDir, audioFilename), buffer);
    fs.writeFileSync(
      path.join(nodePath, 'audio_meta.json'),
      JSON.stringify([{ filename: audioFilename, recordedAt: now }], null, 2),
    );
  }

  const relPath = parentRelPath ? `${parentRelPath}/${finalName}` : finalName;
  return { name: finalName, title: finalName, type: 'summary', path: relPath, ...meta };
}

module.exports = {
  getFullTree,
  createFolder,
  createSummary,
  renameNode,
  deleteNode,
  getSummaryContent,
  setSummaryContent,
  getSummaryHistory,
  restoreHistoryVersion,
  listAudioFiles,
  saveAudioBuffer,
  deleteAudioFile,
  getAudioFilePath,
  bulkImport,
  getNeighbors,
  importFileToFolder,
  summariesRoot,
};
