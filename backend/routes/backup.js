const express = require('express');
const multer  = require('multer');
const router  = express.Router();

const {
  buildDocx, exportZip, importZip, listBackups, saveBackup, openInWord, readWordCache, syncWordFile,
  bulkImportWord, exportWordZip,
} = require('../controllers/backupController');
const {
  getSummaryContent, getSummaryHistory, restoreHistoryVersion,
} = require('../controllers/filesController');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

// ─── DOCX export ─────────────────────────────────────────────────────────────

// POST /api/backup/docx  { nodePath, title, html? }
router.post('/docx', async (req, res) => {
  try {
    const { nodePath, title, html } = req.body;
    if (!nodePath) return res.status(400).json({ error: 'נדרש nodePath' });

    // Use provided HTML or fall back to saved content
    const content = html !== undefined ? html : getSummaryContent(nodePath);
    const buffer  = await buildDocx(title || nodePath, content);

    const rawTitle   = (title || nodePath).trim().slice(0, 60) || 'summary';
    const asciiName  = rawTitle.replace(/[^\x20-\x7E]/g, '_').replace(/["/\\?*:|<>]/g, '_') + '.doc';
    const encodedName = encodeURIComponent(rawTitle + '.doc');
    res.setHeader('Content-Disposition',
      `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`);
    res.setHeader('Content-Type', 'application/msword');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ZIP backup/export ────────────────────────────────────────────────────────

// GET /api/backup/zip?subPath=optional/folder
router.get('/zip', (req, res) => {
  try {
    const { subPath, save } = req.query;
    const buffer = exportZip(subPath || '');
    const name   = `backup_${new Date().toISOString().slice(0, 10)}.zip`;

    if (save === '1') saveBackup(buffer);

    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.setHeader('Content-Type', 'application/zip');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ZIP import ───────────────────────────────────────────────────────────────

// POST /api/backup/import  multipart: field "zip" + optional field "targetPath"
router.post('/import', upload.single('zip'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'נדרש קובץ ZIP' });
    const targetPath = req.body.targetPath || '';
    const result = importZip(req.file.buffer, targetPath);
    res.json({ ok: true, imported: result.imported });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Saved backups list ───────────────────────────────────────────────────────

router.get('/list', (_req, res) => {
  try { res.json(listBackups()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Version history ─────────────────────────────────────────────────────────

// GET /api/backup/history?path=...
router.get('/history', (req, res) => {
  try {
    const { path: nodePath } = req.query;
    if (!nodePath) return res.status(400).json({ error: 'נדרש path' });
    res.json(getSummaryHistory(nodePath));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/backup/restore  { nodePath, versionIndex }
router.post('/restore', (req, res) => {
  try {
    const { nodePath, versionIndex } = req.body;
    if (!nodePath) return res.status(400).json({ error: 'נדרש nodePath' });
    const content = restoreHistoryVersion(nodePath, versionIndex ?? 0);
    res.json({ ok: true, content });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// ─── Open in local Word ───────────────────────────────────────────────────────

// POST /api/backup/open-in-word  { nodePath, title, html? }
router.post('/open-in-word', async (req, res) => {
  try {
    const { nodePath, title, html } = req.body;
    if (!nodePath) return res.status(400).json({ error: 'נדרש nodePath' });
    const result = await openInWord(nodePath, title, html);
    res.json({ ok: true, filePath: result.filePath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/backup/word-sync?nodePath=...&title=...
router.get('/word-sync', (req, res) => {
  try {
    const { nodePath, title } = req.query;
    if (!nodePath) return res.status(400).json({ error: 'נדרש nodePath' });
    const info = readWordCache(title, nodePath);
    res.json({ ok: true, ...info });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// POST /api/backup/sync-word  { nodePath, title }
// Manual on-demand sync: read newest Word file from word_cache or summary folder,
// sanitize, and overwrite content.txt in the summary tree.
router.post('/sync-word', (req, res) => {
  try {
    const { nodePath, title } = req.body;
    if (!nodePath) return res.status(400).json({ error: 'נדרש nodePath' });
    const result = syncWordFile(nodePath, title);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/backup/import-word-bulk — import a folder of Word files
router.post('/import-word-bulk', upload.array('files', 500), async (req, res) => {
  try {
    const files      = req.files || [];
    const rawPaths   = req.body.paths;
    const relPaths   = Array.isArray(rawPaths) ? rawPaths : (rawPaths ? [rawPaths] : []);
    const targetRoot = (req.body.targetRoot || '').trim().replace(/^\/+|\/+$/g, '');
    if (!files.length) return res.status(400).json({ success: false, message: 'לא נבחרו קבצים' });
    const result = await bulkImportWord(files, relPaths, targetRoot);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/backup/export-word-zip — export full tree as Word files in a ZIP
router.get('/export-word-zip', (req, res) => {
  try {
    const buffer = exportWordZip();
    const fname  = `word_export_${new Date().toISOString().slice(0, 10)}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
