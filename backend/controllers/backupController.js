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

  // 1. Flatten <div> wrappers → <p> so Word doesn't create floating text boxes
  let html = raw
    .replace(/<div([^>]*)>/gi, '<p$1>')
    .replace(/<\/div>/gi, '</p>');

  // 2. Strip inline CSS properties that cause Word to render shapes/frames
  const BLOCKED_PROPS = /^(width|height|position|margin|padding|float|clear|display|overflow|z-index|top|left|right|bottom)$/i;
  html = html.replace(/style="([^"]*)"/gi, (_m, styleStr) => {
    const clean = styleStr
      .split(';')
      .map(s => s.trim())
      .filter(s => {
        const prop = s.split(':')[0].trim();
        return prop && !BLOCKED_PROPS.test(prop);
      })
      .join('; ');
    return clean ? `style="${clean}"` : '';
  });

  // 3. Convert all list items to literal dash paragraphs — bypasses Word's
  //    list engine entirely, guaranteeing no auto-numbering and clean two-way sync.
  html = html.replace(
    /<li[^>]*>([\s\S]*?)<\/li>/gis,
    '<p style="margin-top:0;margin-bottom:0;margin-right:20px;direction:rtl;text-align:right">- $1</p>',
  );

  // 4. Strip <ul>, </ul>, <ol>, </ol> wrappers — now empty after li conversion
  html = html
    .replace(/<\/?ul[^>]*>/gi, '')
    .replace(/<\/?ol[^>]*>/gi, '');

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
  const exportPath        = path.join(summaryFolderPath, 'document.doc');
  if (fs.existsSync(summaryFolderPath)) {
    try {
      fs.writeFileSync(exportPath, buffer);
      console.log('Word Engine [EXPORT]: Writing master web content to:', exportPath);
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

// ─── Binary DOCX XML → simple HTML converter ─────────────────────────────────
// Used when Word saves in native ZIP/DOCX format instead of HTML.

function _convertDocxXmlToHtml(xml) {
  const paras = [];
  const pRegex = /<w:p[\s>][\s\S]*?<\/w:p>/gi;
  let pm;
  while ((pm = pRegex.exec(xml)) !== null) {
    const texts = [];
    const tRegex = /<w:t[^>]*>([\s\S]*?)<\/w:t>/gi;
    let tm;
    while ((tm = tRegex.exec(pm[0])) !== null) texts.push(tm[1]);
    const text = texts.join('');
    if (text.trim()) {
      const safe = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      paras.push(`<p dir="rtl">${safe}</p>`);
    }
  }
  return paras.join('\n');
}

// ─── Shared Word body sanitizer ───────────────────────────────────────────────

function _sanitizeWordBody(body) {
  let b = body;
  // Strip XML namespace tags (o:p, w:*, m:*, v:*, x:*)
  b = b.replace(/<\/?(o|w|m|v|x):[^>\s/]*[^>]*\/?>/gi, '');
  // Strip xmlns declarations
  b = b.replace(/\s+xmlns(?::[a-z0-9]+)?="[^"]*"/gi, '');
  // Strip Mso class names
  b = b.replace(/\s+class="Mso[^"]*"/gi, '');
  b = b.replace(/\s+class='Mso[^']*'/gi, '');
  // Strip mso-* inline style directives, keep valid CSS
  b = b.replace(/style="([^"]*)"/gi, (_m, s) => {
    const clean = s.split(';')
      .map(p => p.trim())
      .filter(p => p && !/^(mso-|tab-stops|text-autospace|punctuation-wrap)/i.test(p))
      .join('; ');
    return clean ? `style="${clean}"` : '';
  });
  // Collapse empty spans and blank paragraphs Word injects
  b = b.replace(/<span[^>]*>\s*<\/span>/gi, '');
  b = b.replace(/<p[^>]*>(\s*&nbsp;\s*|\s*)<\/p>/gi, '');
  return b.trim();
}

// ─── Word HTML sanitizer (import: .doc HTML → app) ───────────────────────────
// Permissive three-step fallback — no longer rejects on missing schema markers.

function _extractWordHtmlBody(raw) {
  // Strip metadata blocks
  let html = raw
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  // Step 1: permissive <body> regex
  let body;
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) {
    body = bodyMatch[1];
  } else {
    // Step 2: split on <body (catches body tags with complex attributes)
    const bodyIdx = html.toLowerCase().indexOf('<body');
    if (bodyIdx !== -1) {
      const closeTag = html.indexOf('>', bodyIdx);
      body = closeTag !== -1
        ? html.slice(closeTag + 1).replace(/<\/body[\s\S]*$/i, '')
        : html;
    } else {
      // Step 3: ultimate fallback — no <body> at all, use entire content
      console.log('Word Sync: No <body> tag detected — using full content as body');
      body = html;
    }
  }

  return _sanitizeWordBody(body);
}

// ─── Two-way sync: pure mtime-polling (resilient against Word atomic saves) ──
// Word's atomic save (delete old file + write new) instantly kills fs.watch
// file descriptors. An mtime-cache poll every 3 s is the only reliable approach.

const _docMtimeCache = new Map(); // absPath → last-known mtimeMs

function _syncWordFile(absPath) {
  if (!fs.existsSync(absPath)) return;
  try {
    const raw = fs.readFileSync(absPath, { encoding: 'utf-8', flag: 'r' });
    if (!raw.includes('urn:schemas-microsoft-com:office:word')) return;
    const body = _extractWordHtmlBody(raw);
    if (!body) return;
    const nodeRelPath = path.relative(summariesRoot, path.dirname(absPath));
    const contentPath = path.join(summariesRoot, nodeRelPath, 'content.txt');
    const docMtime    = fs.statSync(absPath).mtimeMs;
    const cntMtime    = fs.existsSync(contentPath) ? fs.statSync(contentPath).mtimeMs : 0;
    if (docMtime <= cntMtime + 2000) return;
    setSummaryContent(nodeRelPath, body);
  } catch { /* ignore errors from locked/partial reads */ }
}

function _walkDocFiles(dir, results) {
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('~$')) continue; // skip Word lock/temp files
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        _walkDocFiles(abs, results);
      } else if (entry.name === 'document.doc') {
        results.push(abs);
      }
    }
  } catch {}
}

function _pollForWordChanges() {
  const docs = [];
  _walkDocFiles(summariesRoot, docs);
  for (const absPath of docs) {
    try {
      const newMtime = fs.statSync(absPath).mtimeMs;
      const cached   = _docMtimeCache.get(absPath);
      if (cached === undefined) {
        _docMtimeCache.set(absPath, newMtime); // seed on first discovery
        continue;
      }
      if (newMtime > cached + 1000) {
        _docMtimeCache.set(absPath, newMtime);
        _syncWordFile(absPath);
      }
    } catch {}
  }
}

// ─── Manual on-demand Word sync ───────────────────────────────────────────────
// Replaces background polling. Called by POST /api/backup/sync-word.

function syncWordFile(nodePath) {
  const dir      = path.join(summariesRoot, nodePath);
  const docxPath = path.join(dir, 'document.docx');
  const docPath  = path.join(dir, 'document.doc');

  // Explicitly skip Word temporary lock files (prefixed with ~$)
  // This guard is defensive — we never construct lock-file paths above,
  // but protects against unexpected filesystem states.
  for (const candidate of [docxPath, docPath]) {
    if (path.basename(candidate).startsWith('~$')) {
      const err = new Error('לא ניתן לקרוא קובץ נעילה זמני של Word');
      err.status = 400;
      throw err;
    }
  }

  let chosenPath = null;
  let staleDocPath = null; // track old .doc to delete after successful .docx sync
  if (fs.existsSync(docxPath)) {
    chosenPath   = docxPath;
    staleDocPath = fs.existsSync(docPath) ? docPath : null;
  } else if (fs.existsSync(docPath)) {
    chosenPath = docPath;
  } else {
    console.log(`Word Engine [SYNC]: No Word file found in -> ${dir}`);
    const notFoundErr = new Error('לא נמצא קובץ Word שמור עבור סיכום זה.');
    notFoundErr.status = 404;
    throw notFoundErr;
  }

  console.log('Word Engine [SYNC]: Extracting user changes directly from:', chosenPath);

  // Read as Buffer first — detect binary ZIP vs HTML text by magic bytes
  const buf      = fs.readFileSync(chosenPath);
  const isBinary = buf[0] === 0x50 && buf[1] === 0x4B; // "PK" ZIP magic
  console.log(`Word Engine [SYNC]: Format — ${isBinary ? 'binary ZIP/DOCX' : 'HTML text'} (${buf.length} bytes)`);

  let body;
  if (isBinary) {
    // Native .docx (ZIP): unpack word/document.xml and convert to simple HTML
    try {
      const zip      = new AdmZip(buf);
      const xmlEntry = zip.getEntry('word/document.xml');
      if (!xmlEntry) throw new Error('word/document.xml חסר בתוך ה-ZIP');
      const xml = xmlEntry.getData().toString('utf-8');
      body = _convertDocxXmlToHtml(xml);
      console.log(`Word Engine [SYNC]: Binary extraction yielded ${body.length} chars`);
    } catch (zipErr) {
      throw new Error(`שגיאה בקריאת קובץ Word בינארי: ${zipErr.message}`);
    }
  } else {
    // HTML export from Word: permissive extraction, no schema validation
    const raw = buf.toString('utf-8');
    body = _extractWordHtmlBody(raw);
    console.log(`Word Engine [SYNC]: HTML extraction yielded ${body.length} chars`);
  }

  if (!body.trim()) throw new Error('לא ניתן לחלץ תוכן מהקובץ');
  setSummaryContent(nodePath, body);
  console.log(`Word Engine [SYNC]: content.txt updated for ${nodePath}`);

  // If we read from a native .docx, remove the stale .doc so future syncs
  // don't accidentally fall back to an outdated HTML export.
  if (staleDocPath) {
    try { fs.unlinkSync(staleDocPath); }
    catch { /* locked or already gone — not fatal */ }
  }

  return { ok: true };
}

module.exports = { buildDocx, exportZip, importZip, listBackups, saveBackup, openInWord, readWordCache, syncWordFile };
