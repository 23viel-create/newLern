'use strict';
const fs   = require('fs');
const path = require('path');

const BOOKS_DIR = path.resolve(__dirname, '../../data/books');

const SUPPORTED_EXTS = ['.pdf', '.docx', '.pptx'];

function ensureDir() {
  if (!fs.existsSync(BOOKS_DIR)) fs.mkdirSync(BOOKS_DIR, { recursive: true });
}

function _readMeta(filename) {
  try {
    const metaPath = path.join(BOOKS_DIR, filename + '.meta.json');
    if (fs.existsSync(metaPath)) return JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  } catch {}
  return {};
}

function saveBookMeta(absFilePath, originalName) {
  try {
    fs.writeFileSync(absFilePath + '.meta.json', JSON.stringify({ originalName }));
  } catch {}
}

function _readMetaAbs(absFilePath) {
  try { return JSON.parse(fs.readFileSync(absFilePath + '.meta.json', 'utf-8')); }
  catch { return {}; }
}

function _scanDir(absDir, relFolder) {
  const books = [];
  try {
    for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
      const absEntry = path.join(absDir, entry.name);
      if (entry.isDirectory()) {
        const subRel = relFolder ? `${relFolder}/${entry.name}` : entry.name;
        books.push(..._scanDir(absEntry, subRel));
      } else if (SUPPORTED_EXTS.includes(path.extname(entry.name).toLowerCase())) {
        const stat = fs.statSync(absEntry);
        const meta = _readMetaAbs(absEntry);
        books.push({
          name:        entry.name,
          folder:      relFolder,
          displayName: meta.originalName || entry.name,
          size:        stat.size,
          uploadedAt:  stat.birthtime.toISOString(),
        });
      }
    }
  } catch {}
  return books;
}

function listBooks() {
  ensureDir();
  return _scanDir(BOOKS_DIR, '').sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

function listFolders() {
  ensureDir();
  const folders = [{ name: 'ראשי', path: '' }];
  function scan(absDir, relFolder) {
    try {
      for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          const subRel = relFolder ? `${relFolder}/${entry.name}` : entry.name;
          folders.push({ name: entry.name, path: subRel });
          scan(path.join(absDir, entry.name), subRel);
        }
      }
    } catch {}
  }
  scan(BOOKS_DIR, '');
  return folders;
}

function createBookFolder(relPath) {
  const safePath = path.normalize(relPath).replace(/^[./\\]+/, '');
  if (!safePath) throw new Error('שם תיקייה לא חוקי');
  const absPath = path.join(BOOKS_DIR, safePath);
  if (!absPath.startsWith(BOOKS_DIR + path.sep) && absPath !== BOOKS_DIR) {
    throw new Error('נתיב לא חוקי');
  }
  fs.mkdirSync(absPath, { recursive: true });
  return safePath;
}

function deleteBook(relName) {
  // relName may be "folder/file.pdf" or just "file.pdf"
  const safeName = relName.replace(/\\/g, '/').split('/').map(p => path.basename(p)).join('/');
  if (!SUPPORTED_EXTS.includes(path.extname(safeName).toLowerCase())) {
    throw new Error('שם קובץ לא חוקי');
  }
  const filePath = path.join(BOOKS_DIR, safeName);
  if (!filePath.startsWith(BOOKS_DIR)) throw new Error('נתיב לא חוקי');
  if (!fs.existsSync(filePath)) throw new Error('הספר לא נמצא');
  fs.unlinkSync(filePath);
  try { fs.unlinkSync(filePath + '.meta.json'); } catch {}
}

async function extractPdfText(filePath, maxChars) {
  try {
    const pdfParse = require('pdf-parse/lib/pdf-parse');
    const buf  = fs.readFileSync(filePath);
    const data = await pdfParse(buf);
    return (data.text || '').slice(0, maxChars);
  } catch {
    return '';
  }
}

async function extractOfficeText(filePath, maxChars) {
  try {
    const officeParser = require('officeparser');
    const text = await officeParser.parseOfficeAsync(filePath);
    return (text || '').slice(0, maxChars);
  } catch {
    return '';
  }
}

async function extractBookText(filePath, maxChars) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') return extractPdfText(filePath, maxChars);
  if (ext === '.docx' || ext === '.pptx') return extractOfficeText(filePath, maxChars);
  return '';
}

// selectedBooks: array of filenames to include, or null/empty = all books
async function getBooksContext(maxCharsPerBook = 2500, selectedBooks = null) {
  ensureDir();
  let books = listBooks();

  if (selectedBooks && selectedBooks.length > 0) {
    const selected = new Set(selectedBooks);
    books = books.filter(b => selected.has(b.name));
  }

  books = books.slice(0, 5); // cap at 5 to keep prompt manageable
  if (!books.length) return '';

  const parts = [];
  for (const book of books) {
    const text = await extractBookText(path.join(BOOKS_DIR, book.name), maxCharsPerBook);
    if (text.trim()) parts.push(`[ספר: ${book.name}]\n${text.trim()}`);
  }
  return parts.join('\n\n---\n\n');
}

module.exports = { listBooks, listFolders, createBookFolder, deleteBook, saveBookMeta, getBooksContext, BOOKS_DIR, SUPPORTED_EXTS };
