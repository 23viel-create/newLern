'use strict';
const fs   = require('fs');
const path = require('path');

const BOOKS_DIR = path.resolve(__dirname, '../../data/books');

function ensureDir() {
  if (!fs.existsSync(BOOKS_DIR)) fs.mkdirSync(BOOKS_DIR, { recursive: true });
}

function listBooks() {
  ensureDir();
  return fs.readdirSync(BOOKS_DIR)
    .filter(f => f.toLowerCase().endsWith('.pdf'))
    .map(f => {
      const stat = fs.statSync(path.join(BOOKS_DIR, f));
      return { name: f, size: stat.size, uploadedAt: stat.birthtime.toISOString() };
    })
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

function deleteBook(name) {
  const safeName = path.basename(name);
  if (!safeName.toLowerCase().endsWith('.pdf')) throw new Error('שם קובץ לא חוקי');
  const filePath = path.join(BOOKS_DIR, safeName);
  if (!fs.existsSync(filePath)) throw new Error('הספר לא נמצא');
  fs.unlinkSync(filePath);
}

async function extractPdfText(filePath, maxChars) {
  try {
    // Use lib path to avoid pdf-parse's debug test runner
    const pdfParse = require('pdf-parse/lib/pdf-parse');
    const buf  = fs.readFileSync(filePath);
    const data = await pdfParse(buf);
    return (data.text || '').slice(0, maxChars);
  } catch {
    return '';
  }
}

async function getBooksContext(maxCharsPerBook = 2500) {
  ensureDir();
  const books = listBooks().slice(0, 5); // cap at 5 to keep prompt manageable
  if (!books.length) return '';

  const parts = [];
  for (const book of books) {
    const text = await extractPdfText(path.join(BOOKS_DIR, book.name), maxCharsPerBook);
    if (text.trim()) parts.push(`[ספר: ${book.name}]\n${text.trim()}`);
  }
  return parts.join('\n\n---\n\n');
}

module.exports = { listBooks, deleteBook, getBooksContext, BOOKS_DIR };
