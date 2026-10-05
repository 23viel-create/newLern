'use strict';
const express = require('express');
const router  = express.Router();
const { listNotes, saveNote, deleteNote } = require('../controllers/notesController');

// GET /api/notes?date=YYYY-MM-DD
router.get('/', (req, res) => {
  try {
    const notes = listNotes(req.query.date || null);
    res.json({ success: true, data: notes });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/notes — create or update
router.post('/', (req, res) => {
  try {
    const note = saveNote(req.body);
    res.json({ success: true, data: note });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// DELETE /api/notes/:id
router.delete('/:id', (req, res) => {
  try {
    deleteNote(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(404).json({ success: false, message: err.message });
  }
});

module.exports = router;
