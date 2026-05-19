'use strict';
const fs   = require('fs');
const path = require('path');

const NOTES_DIR = path.resolve(__dirname, '../../data/notes');

function _ensureDir() {
  if (!fs.existsSync(NOTES_DIR)) fs.mkdirSync(NOTES_DIR, { recursive: true });
}

function _genId() {
  return `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function _safeRead(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')); }
  catch { return null; }
}

// List all notes, optionally filtered by target date
function listNotes(filterDate) {
  _ensureDir();
  const notes = fs.readdirSync(NOTES_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => _safeRead(path.join(NOTES_DIR, f)))
    .filter(Boolean);

  const filtered = filterDate
    ? notes.filter(n => n.targetDate === filterDate)
    : notes;

  return filtered.sort((a, b) => {
    if (!!a.isPinned !== !!b.isPinned) return a.isPinned ? -1 : 1;
    return new Date(b.dateModified) - new Date(a.dateModified);
  });
}

// Create or update a note (upsert by id)
function saveNote(noteData) {
  _ensureDir();
  const now = new Date().toISOString();
  const note = {
    id:           noteData.id || _genId(),
    title:        String(noteData.title || '').slice(0, 200),
    richBody:     String(noteData.richBody || ''),
    isPinned:     !!noteData.isPinned,
    targetDate:   noteData.targetDate || null,
    dateCreated:  noteData.dateCreated || now,
    dateModified: now,
  };
  const filePath = path.join(NOTES_DIR, note.id + '.json');
  fs.writeFileSync(filePath, JSON.stringify(note, null, 2));
  return note;
}

// Delete a note by id
function deleteNote(id) {
  _ensureDir();
  const safeName = path.basename(id).replace(/[^a-z0-9\-]/g, '');
  const filePath = path.join(NOTES_DIR, safeName + '.json');
  if (!fs.existsSync(filePath)) throw new Error('פתק לא נמצא');
  fs.unlinkSync(filePath);
}

module.exports = { listNotes, saveNote, deleteNote };
