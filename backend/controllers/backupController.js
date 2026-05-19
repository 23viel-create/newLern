const fs   = require('fs');
const path = require('path');
const { exec } = require('child_process');
const AdmZip = require('adm-zip');
const { summariesRoot, getSummaryContent, setSummaryContent } = require('./filesController');

const DATA_ROOT = path.resolve(__dirname, '../../data');

// ─── helpers ──────────────────────────────────────────────────────────────────

function _ts() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

// ─── Word HTML export (.doc — MS-Word-compatible HTML) ───────────────────────

function _preprocessHtmlForWord(raw) {
  if (!raw) return '<p></p>';

  // 1. Flatten <div> wrappers → <p> so Word doesn't treat them as textboxes
  let html = raw
    .replace(/<div([^>]*)>/gi, '<p$1>')
    .replace(/<\/div>/gi, '</p>');

  // 2. Convert markdown-style dash lists: <p>- text</p> or <p>• text</p>
  html = html.replace(
    /<p[^>]*>\s*[-–•]\s*([\s\S]*?)<\/p>/gi,
    '<li style="list-style-type:disc;direction:rtl;text-align:right;mso-list:l0 level1 lfo1">$1</li>',
  );

  // 3. Wrap consecutive <li> runs in <ul>
  html = html.replace(
    /(<li[^>]*>[\s\S]*?<\/li>\s*)+/gi,
    (block) => `<ul style="direction:rtl;margin:4pt 0 4pt 1.2em">${block}</ul>`,
  );

  // 4. Ensure every <li> without explicit RTL style gets one
  html = html.replace(
    /<li(?![^>]*list-style-type)/gi,
    '<li style="list-style-type:disc;direction:rtl;text-align:right"',
  );

  return html;
}

function buildDocx(_title, htmlContent) {
  const body = _preprocessHtmlForWord(htmlContent);
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
     xmlns:w="urn:schemas-microsoft-com:office:word"
     xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="UTF-8">
  <meta name="ProgId" content="Word.Document">
  <meta name="Generator" content="Microsoft Word 11">
  <style>
    @page { margin: 2cm; mso-page-orientation: portrait; }
    body  { direction: rtl; font-family: Arial, sans-serif; font-size: 12pt; }
    p     { margin: 0 0 6pt 0; direction: rtl; }
    h1, h2, h3 { margin: 8pt 0 4pt 0; direction: rtl; }
    ul, ol { margin: 4pt 0 4pt 1.5em; direction: rtl; padding-right: 1.2em; }
    li     { margin-bottom: 2pt; list-style-type: disc; direction: rtl; text-align: right; }
    strong { font-weight: bold; }
    em     { font-style: italic; }
    u      { text-decoration: underline; }
  </style>
  <!--[if gte mso 9]><xml>
    <w:WordDocument>
      <w:View>Normal</w:View>
      <w:Zoom>100</w:Zoom>
      <w:BiDi/>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml><![endif]-->
</head>
<body dir="rtl">
${body}
</body>
</html>`;
  return Buffer.from(html, 'utf-8');
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

  // Dual-mirror: if document.doc exists but content.txt is newer, regenerate from content
  let content;
  if (html !== undefined) {
    content = html;
  } else {
    content = getSummaryContent(nodePath);
    // Check if existing document.doc is stale compared to content.txt
    const summaryDocxPath = path.join(summariesRoot, nodePath, 'document.doc');
    const contentTxtPath  = path.join(summariesRoot, nodePath, 'content.txt');
    if (fs.existsSync(summaryDocxPath) && fs.existsSync(contentTxtPath)) {
      const docxMtime    = fs.statSync(summaryDocxPath).mtimeMs;
      const contentMtime = fs.statSync(contentTxtPath).mtimeMs;
      if (contentMtime > docxMtime + 2000) {
        try { fs.unlinkSync(summaryDocxPath); } catch (e) {
          if (e.code === 'EBUSY' || e.code === 'EPERM') {
            throw new Error('קובץ הוורד פתוח כעת בתוכנת Word. אנא שמור וסגור אותו כדי לאפשר סנכרון מחדש.');
          }
        }
      }
    }
  }
  const buffer = await buildDocx(title || nodePath, content);

  // Save to summary folder as the canonical document.doc (dual-file architecture)
  const summaryFolderPath = path.join(summariesRoot, nodePath);
  if (fs.existsSync(summaryFolderPath)) {
    try {
      fs.writeFileSync(path.join(summaryFolderPath, 'document.doc'), buffer);
    } catch (e) {
      if (e.code !== 'EBUSY' && e.code !== 'EPERM') throw e;
      // File locked by Word — silently skip the summary-folder copy; word_cache copy below still works
    }
  }

  // Also save a named copy in word_cache for the OS open command
  const safeBase = (title || nodePath).replace(/[^\w֐-׿‏‎ -]/g, '_').slice(0, 60);
  let filePath   = path.join(WORD_CACHE_DIR, safeBase + '.doc');

  // EBUSY retry: if main path is locked, try incrementing filename suffix
  let written = false;
  for (let attempt = 0; attempt <= 5; attempt++) {
    const tryPath = attempt === 0
      ? filePath
      : path.join(WORD_CACHE_DIR, `${safeBase}_${attempt}.doc`);
    try {
      fs.writeFileSync(tryPath, buffer);
      filePath = tryPath;
      written  = true;
      break;
    } catch (e) {
      if ((e.code === 'EBUSY' || e.code === 'EPERM') && attempt < 5) continue;
      throw new Error('קובץ הוורד פתוח כעת בתוכנת Word. אנא שמור וסגור אותו כדי לאפשר סנכרון מחדש.');
    }
  }
  if (!written) throw new Error('לא ניתן לשמור קובץ Word — נסה שנית לאחר סגירת Word.');

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
  // Primary: document.doc inside the summary folder
  if (nodePath) {
    const summaryDocx   = path.join(summariesRoot, nodePath, 'document.doc');
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
  const filePath = path.join(WORD_CACHE_DIR, safeBase + '.doc');
  if (!fs.existsSync(filePath)) throw new Error('קובץ Word לא נמצא — פתח אותו תחילה');
  const stat = fs.statSync(filePath);
  return { filePath, size: stat.size, mtime: stat.mtimeMs, newerThanContent: false };
}

// ─── Two-way sync: watch Word files for user edits ───────────────────────────
// Word uses atomic safe-writes (temp file → rename), which often bypasses
// inode-level fs.watch hooks. We use a hybrid approach:
//  1. fs.watch on the summaries ROOT directory (directory-level, survives renames)
//  2. A 4-second polling interval as a safety net for atomic saves that slip through

function _extractWordHtmlBody(raw) {
  const m = raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return m ? m[1].trim() : '';
}

const _watchDebounce = new Map(); // absPath → timeout id

function _syncWordFile(absPath) {
  if (!fs.existsSync(absPath)) return;
  try {
    // Open with a fresh file descriptor each time to avoid stale handles
    const raw = fs.readFileSync(absPath, { encoding: 'utf-8', flag: 'r' });
    if (!raw.includes('urn:schemas-microsoft-com:office:word')) return;
    const body = _extractWordHtmlBody(raw);
    if (!body) return;
    const nodeRelPath = path.relative(summariesRoot, path.dirname(absPath));
    const contentPath = path.join(summariesRoot, nodeRelPath, 'content.txt');
    const docMtime    = fs.statSync(absPath).mtimeMs;
    const cntMtime    = fs.existsSync(contentPath) ? fs.statSync(contentPath).mtimeMs : 0;
    // Only update if the .doc is meaningfully newer than content.txt (2s grace)
    if (docMtime <= cntMtime + 2000) return;
    setSummaryContent(nodeRelPath, body);
  } catch { /* ignore errors from locked/partial reads */ }
}

function _scheduleSyncDoc(absPath) {
  if (_watchDebounce.has(absPath)) clearTimeout(_watchDebounce.get(absPath));
  _watchDebounce.set(absPath, setTimeout(() => {
    _watchDebounce.delete(absPath);
    _syncWordFile(absPath);
  }, 900)); // 900ms — enough for Word to finish its atomic swap
}

function _pollWordDir(dir) {
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        _pollWordDir(abs);
      } else if (entry.name === 'document.doc') {
        // Only schedule sync if it's not already debounce-queued
        if (!_watchDebounce.has(abs)) _syncWordFile(abs);
      }
    }
  } catch {}
}

function watchWordFiles() {
  if (!fs.existsSync(summariesRoot)) return;

  // 1. fs.watch on the root directory — catches inotify events (change + rename)
  try {
    fs.watch(summariesRoot, { recursive: true }, (eventType, filename) => {
      if (!filename) return;
      const normalized = filename.replace(/\\/g, '/');
      // Accept the file itself OR a temp-file rename that implies document.doc changed
      const docName = normalized.endsWith('document.doc')
        ? normalized
        : normalized.includes('/') ? path.dirname(normalized) + '/document.doc' : null;
      if (!docName) return;
      const absPath = path.join(summariesRoot, docName);
      _scheduleSyncDoc(absPath);
    });
  } catch { /* fs.watch unavailable on this platform */ }

  // 2. Polling fallback every 4 seconds — catches atomic saves that bypass inotify
  setInterval(() => _pollWordDir(summariesRoot), 4000);
}

module.exports = { buildDocx, exportZip, importZip, listBackups, saveBackup, openInWord, readWordCache, watchWordFiles };
