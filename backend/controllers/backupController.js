const fs   = require('fs');
const path = require('path');
const { exec } = require('child_process');
const AdmZip = require('adm-zip');
const { Document, Packer, Paragraph, TextRun, AlignmentType } = require('docx');
const { summariesRoot, getSummaryContent, createFolder } = require('./filesController');

const DATA_ROOT = path.resolve(__dirname, '../../data');

// ─── helpers ──────────────────────────────────────────────────────────────────

function _ts() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

// ─── HTML → docx rich paragraphs ─────────────────────────────────────────────

function _extractColor(tagStr) {
  // Match color from style="color:#RRGGBB" or style="color:rgb(...)"
  const hex = tagStr.match(/color\s*:\s*#([0-9a-fA-F]{3,6})/);
  if (hex) {
    const h = hex[1];
    return h.length === 3 ? h.split('').map(c => c + c).join('') : h.toUpperCase();
  }
  const rgb = tagStr.match(/color\s*:\s*rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
  if (rgb) {
    return [rgb[1], rgb[2], rgb[3]]
      .map(n => parseInt(n, 10).toString(16).padStart(2, '0'))
      .join('').toUpperCase();
  }
  return null;
}

function _parseInlineHtml(fragment) {
  const runs = [];
  let bold = false, underline = false, italic = false, color = null;

  const HE_LANG = { value: 'he-IL', eastAsia: 'he-IL', bidi: 'he-IL' };

  const parts = fragment.split(/(<[^>]+>)/);
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith('<')) {
      const isClosing = part.startsWith('</');
      const tagName   = part.replace(/<\/?([a-zA-Z][^>\s]*)[\s\S]*>/, '$1').toLowerCase();

      if (!isClosing) {
        // Attempt inline color extraction from ANY opening tag
        const c = _extractColor(part);
        if (c) color = c;
      }

      if (['strong', 'b'].includes(tagName)) {
        bold = !isClosing;
        if (isClosing) color = null;
      } else if (['u', 'ins'].includes(tagName)) {
        underline = !isClosing;
      } else if (['em', 'i'].includes(tagName)) {
        italic = !isClosing;
      } else if (tagName === 'span' || tagName === 'font') {
        if (isClosing) color = null;
      }
    } else {
      const text = part
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
      if (!text) continue;
      const props = { text, size: 24, language: HE_LANG };
      if (bold)      props.bold      = true;
      if (underline) props.underline = {};
      if (italic)    props.italics   = true;
      if (color)     props.color     = color;
      runs.push(new TextRun(props));
    }
  }

  if (!runs.length) runs.push(new TextRun({ text: '', size: 24, language: HE_LANG }));
  return runs;
}

function _htmlToDocxParagraphs(html) {
  const paragraphs = [];
  const BULLET     = '\x00BULLET\x00';

  // Normalise block boundaries → newline markers; bullet items get a prefix
  const normalised = (html || '')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<h[1-6][^>]*>/gi, '')
    .replace(/<li[^>]*>/gi,  BULLET)
    .replace(/<\/li>/gi,     '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi,      '\n')
    .replace(/<\/div>/gi,    '\n')
    .replace(/<p[^>]*>/gi,   '')
    .replace(/<div[^>]*>/gi, '');

  for (let line of normalised.split('\n')) {
    const isBullet = line.includes(BULLET);
    line = line.replace(new RegExp(BULLET, 'g'), '').trim();

    const runs     = _parseInlineHtml(line);
    const paraProps = { children: runs, alignment: AlignmentType.RIGHT, bidirectional: true };
    if (isBullet) paraProps.bullet = { level: 0 };
    paragraphs.push(new Paragraph(paraProps));
  }

  if (!paragraphs.length) {
    paragraphs.push(new Paragraph({ text: '', alignment: AlignmentType.RIGHT, bidirectional: true }));
  }
  return paragraphs;
}

// ─── DOCX export ─────────────────────────────────────────────────────────────

async function buildDocx(_title, htmlContent) {
  const doc = new Document({
    sections: [{
      properties: {},
      children: _htmlToDocxParagraphs(htmlContent),
    }],
  });
  return Packer.toBuffer(doc);
}

// ─── ZIP export ───────────────────────────────────────────────────────────────

function exportZip(subPath) {
  const zip = new AdmZip();

  // Determine root to export
  let exportRoot = summariesRoot;
  if (subPath) {
    const sub = path.resolve(summariesRoot, subPath);
    if (!sub.startsWith(summariesRoot) || !fs.existsSync(sub)) {
      throw new Error('נתיב לא חוקי לייצוא');
    }
    exportRoot = sub;
  }

  // Add summaries_tree recursively
  _addDirToZip(zip, exportRoot, 'summaries_tree');

  // Add schedule.json
  const scheduleFile = path.join(DATA_ROOT, 'schedule.json');
  if (fs.existsSync(scheduleFile)) {
    zip.addFile('schedule.json', fs.readFileSync(scheduleFile));
  }

  return zip.toBuffer();
}

function _addDirToZip(zip, dirPath, zipPrefix) {
  if (!fs.existsSync(dirPath)) return;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath  = path.join(dirPath, entry.name);
    const zipEntry  = `${zipPrefix}/${entry.name}`;
    if (entry.isDirectory()) {
      _addDirToZip(zip, fullPath, zipEntry);
    } else {
      try {
        zip.addFile(zipEntry, fs.readFileSync(fullPath));
      } catch { /* skip unreadable files */ }
    }
  }
}

// ─── ZIP import ───────────────────────────────────────────────────────────────

function importZip(buffer, targetRelPath) {
  let zip;
  try {
    zip = new AdmZip(buffer);
  } catch {
    throw new Error('קובץ ZIP לא תקין');
  }

  // Determine target in summaries tree
  let targetRoot = summariesRoot;
  if (targetRelPath) {
    const sub = path.resolve(summariesRoot, targetRelPath);
    if (!sub.startsWith(summariesRoot)) throw new Error('נתיב יעד לא חוקי');
    targetRoot = sub;
  }

  const entries = zip.getEntries();
  let imported = 0;

  for (const entry of entries) {
    if (entry.isDirectory) continue;

    const entryName = entry.entryName.replace(/\\/g, '/');

    // Only extract summaries_tree/ content (ignore other root-level files like schedule.json)
    if (!entryName.startsWith('summaries_tree/')) continue;

    const relPart = entryName.slice('summaries_tree/'.length);
    if (!relPart) continue;

    // Safety: no path traversal
    const outPath = path.resolve(targetRoot, relPart);
    if (!outPath.startsWith(targetRoot)) continue;

    // Skip .history directories
    if (relPart.includes('.history')) continue;

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, entry.getData());
    imported++;
  }

  if (imported === 0) throw new Error('לא נמצאו קבצים מתאימים ב-ZIP');
  return { imported };
}

// ─── List backups ─────────────────────────────────────────────────────────────

function listBackups() {
  const backupsDir = path.join(DATA_ROOT, 'backups');
  if (!fs.existsSync(backupsDir)) return [];
  return fs.readdirSync(backupsDir)
    .filter(f => f.endsWith('.zip'))
    .map(f => {
      const stat = fs.statSync(path.join(backupsDir, f));
      return { name: f, size: stat.size, createdAt: stat.birthtime.toISOString() };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// Save a backup copy to data/backups/
function saveBackup(buffer) {
  const backupsDir = path.join(DATA_ROOT, 'backups');
  fs.mkdirSync(backupsDir, { recursive: true });
  const name = `backup_${_ts()}.zip`;
  fs.writeFileSync(path.join(backupsDir, name), buffer);
  return name;
}

// ─── Open in local Word ───────────────────────────────────────────────────────

const WORD_CACHE_DIR = path.join(DATA_ROOT, 'word_cache');

async function openInWord(nodePath, title, html) {
  fs.mkdirSync(WORD_CACHE_DIR, { recursive: true });

  // Dual-mirror: if document.docx exists but content.txt is newer, regenerate from content
  let content;
  if (html !== undefined) {
    content = html;
  } else {
    content = getSummaryContent(nodePath);
    // Check if existing document.docx is stale compared to content.txt
    const summaryDocxPath = path.join(summariesRoot, nodePath, 'document.docx');
    const contentTxtPath  = path.join(summariesRoot, nodePath, 'content.txt');
    if (fs.existsSync(summaryDocxPath) && fs.existsSync(contentTxtPath)) {
      const docxMtime    = fs.statSync(summaryDocxPath).mtimeMs;
      const contentMtime = fs.statSync(contentTxtPath).mtimeMs;
      // If content.txt was modified more than 2 s after document.docx, stale → regenerate
      if (contentMtime > docxMtime + 2000) {
        fs.unlinkSync(summaryDocxPath); // remove stale copy so it gets rebuilt below
      }
    }
  }
  const buffer  = await buildDocx(title || nodePath, content);

  // Save to summary folder as the canonical document.docx (dual-file architecture)
  const summaryFolderPath = path.join(summariesRoot, nodePath);
  if (fs.existsSync(summaryFolderPath)) {
    fs.writeFileSync(path.join(summaryFolderPath, 'document.docx'), buffer);
  }

  // Also save a named copy in word_cache for the OS open command
  const safeBase = (title || nodePath).replace(/[^\w֐-׿‏‎ -]/g, '_').slice(0, 60);
  const filePath = path.join(WORD_CACHE_DIR, safeBase + '.docx');
  fs.writeFileSync(filePath, buffer);

  // Platform open command
  let cmd;
  if (process.platform === 'win32') {
    cmd = `start "" "${filePath}"`;
  } else if (process.platform === 'darwin') {
    cmd = `open "${filePath}"`;
  } else {
    cmd = `xdg-open "${filePath}"`;
  }

  return new Promise((resolve, reject) => {
    exec(cmd, (err) => {
      if (err) reject(new Error(`לא ניתן לפתוח את הקובץ: ${err.message}`));
      else     resolve({ filePath });
    });
  });
}

// Read back .docx metadata for Word sync — checks summary folder first (dual-file)
function readWordCache(title, nodePath) {
  // Primary: document.docx inside the summary folder
  if (nodePath) {
    const summaryDocx   = path.join(summariesRoot, nodePath, 'document.docx');
    const contentFile   = path.join(summariesRoot, nodePath, 'content.txt');
    if (fs.existsSync(summaryDocx)) {
      const docxStat     = fs.statSync(summaryDocx);
      const contentMtime = fs.existsSync(contentFile) ? fs.statSync(contentFile).mtimeMs : 0;
      return {
        filePath:         summaryDocx,
        size:             docxStat.size,
        mtime:            docxStat.mtimeMs,
        newerThanContent: docxStat.mtimeMs > contentMtime + 2000, // 2 s grace period
      };
    }
  }
  // Fallback: named file in word_cache
  const safeBase = (title || nodePath).replace(/[^\w֐-׿‏‎ -]/g, '_').slice(0, 60);
  const filePath = path.join(WORD_CACHE_DIR, safeBase + '.docx');
  if (!fs.existsSync(filePath)) throw new Error('קובץ Word לא נמצא — פתח אותו תחילה');
  const stat = fs.statSync(filePath);
  return { filePath, size: stat.size, mtime: stat.mtimeMs, newerThanContent: false };
}

module.exports = { buildDocx, exportZip, importZip, listBackups, saveBackup, openInWord, readWordCache };
