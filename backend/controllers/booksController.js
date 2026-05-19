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

function saveBookMeta(filename, originalName) {
  try {
    const metaPath = path.join(BOOKS_DIR, filename + '.meta.json');
    fs.writeFileSync(metaPath, JSON.stringify({ originalName }));
  } catch {}
}

function listBooks() {
  ensureDir();
  return fs.readdirSync(BOOKS_DIR)
    .filter(f => SUPPORTED_EXTS.includes(path.extname(f).toLowerCase()))
    .map(f => {
      const stat = fs.statSync(path.join(BOOKS_DIR, f));
      const meta = _readMeta(f);
      return {
        name:        f,
        displayName: meta.originalName || f,
        size:        stat.size,
        uploadedAt:  stat.birthtime.toISOString(),
      };
    })
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

function deleteBook(name) {
  const safeName = path.basename(name);
  if (!SUPPORTED_EXTS.includes(path.extname(safeName).toLowerCase())) {
    throw new Error('שם קובץ לא חוקי');
  }
  const filePath = path.join(BOOKS_DIR, safeName);
  if (!fs.existsSync(filePath)) throw new Error('הספר לא נמצא');
  fs.unlinkSync(filePath);
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

module.exports = { listBooks, deleteBook, saveBookMeta, getBooksContext, BOOKS_DIR, SUPPORTED_EXTS };
