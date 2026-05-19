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
// Word opens HTML files with .doc extension natively, preserving RTL and all
// rich formatting. This approach avoids the docx library's lossy RTL rendering.

function buildDocx(_title, htmlContent) {
  const body = htmlContent || '<p></p>';
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
    ul, ol { margin: 4pt 0 4pt 1.5em; direction: rtl; }
    li     { margin-bottom: 2pt; }
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
// When the user saves a .doc (Word HTML) file that we generated, extract the
// HTML body and update content.txt so the app reflects the edits immediately.

function _extractWordHtmlBody(raw) {
  const m = raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return m ? m[1].trim() : '';
}

const _watchDebounce = new Map(); // filePath → timeout id

function watchWordFiles() {
  if (!fs.existsSync(summariesRoot)) return;

  try {
    fs.watch(summariesRoot, { recursive: true }, (eventType, filename) => {
      if (!filename) return;
      const normalized = filename.replace(/\\/g, '/');
      if (!normalized.endsWith('document.doc')) return;
      if (eventType !== 'change' && eventType !== 'rename') return;

      const absPath = path.join(summariesRoot, normalized);
      // Debounce per file — Word fires multiple events on a single save
      if (_watchDebounce.has(absPath)) clearTimeout(_watchDebounce.get(absPath));
      _watchDebounce.set(absPath, setTimeout(() => {
        _watchDebounce.delete(absPath);
        if (!fs.existsSync(absPath)) return;
        try {
          const raw = fs.readFileSync(absPath, 'utf-8');
          // Verify it's our Word HTML format to avoid processing unrelated files
          if (!raw.includes('urn:schemas-microsoft-com:office:word')) return;
          const body = _extractWordHtmlBody(raw);
          if (!body) return;
          const nodeRelPath = path.relative(summariesRoot, path.dirname(absPath));
          const contentPath = path.join(summariesRoot, nodeRelPath, 'content.txt');
          // Guard: do not write if content.txt is already in sync (mtime within 3s)
          const docMtime = fs.statSync(absPath).mtimeMs;
          const cntMtime = fs.existsSync(contentPath) ? fs.statSync(contentPath).mtimeMs : 0;
          if (Math.abs(docMtime - cntMtime) < 3000) return;
          setSummaryContent(nodeRelPath, body);
        } catch { /* ignore watcher errors */ }
      }, 800));
    });
  } catch { /* fs.watch not supported on this platform — skip */ }
}

module.exports = { buildDocx, exportZip, importZip, listBackups, saveBackup, openInWord, readWordCache, watchWordFiles };
