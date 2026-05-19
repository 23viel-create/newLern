// ─── מנהל פתקיות ─────────────────────────────────────────────────────────────
const NotesManager = (() => {

  let _currentDate  = null;   // date whose notes are shown in the day panel
  let _drawerOpen   = false;
  let _allNotes     = [];
  let _drawerSearch = '';
  let _sortMode     = 'modified'; // 'modified' | 'pinned'

  // ── HTML helpers ────────────────────────────────────────────────────────────

  function _esc(str) {
    return String(str)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _fmtDate(iso) {
    if (!iso) return '';
    return iso.slice(0, 10);
  }

  // ── Day-panel notes ─────────────────────────────────────────────────────────

  async function renderForDate(dateStr) {
    _currentDate = dateStr;
    const panel = document.getElementById('noteDayPanel');
    if (!panel) return;

    panel.innerHTML = '<p class="placeholder-text" style="font-size:0.8rem">טוען פתקיות...</p>';
    try {
      const notes = await Api.getNotes(dateStr);
      _renderDayPanel(panel, notes, dateStr);
    } catch (err) {
      panel.innerHTML = `<p class="placeholder-text error-text" style="font-size:0.78rem">שגיאה: ${_esc(err.message)}</p>`;
    }
  }

  function _renderDayPanel(panel, notes, dateStr) {
    const sorted = _sortNotes(notes, _sortMode);
    const items  = sorted.map(n => _noteCard(n, true)).join('');

    panel.innerHTML = `
      <div class="notes-panel-header">
        <span class="notes-panel-title">📌 פתקיות ליום</span>
        <div class="notes-panel-controls">
          <button class="btn btn--xs btn--ghost notes-sort-btn" data-sort="modified" title="מיין לפי עריכה אחרונה">עריכה</button>
          <button class="btn btn--xs btn--ghost notes-sort-btn" data-sort="pinned"   title="נעוצים תחילה">נעוצים</button>
          <button class="btn btn--xs btn--primary notes-add-btn" data-date="${_esc(dateStr)}">+ פתק</button>
        </div>
      </div>
      <div class="notes-list">${items || '<p class="placeholder-text" style="font-size:0.78rem">אין פתקיות ליום זה</p>'}</div>`;

    _bindDayPanelEvents(panel, dateStr);
  }

  function _bindDayPanelEvents(panel, dateStr) {
    // Sort buttons
    panel.querySelectorAll('.notes-sort-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        _sortMode = btn.dataset.sort;
        renderForDate(dateStr);
      });
    });

    // Add new note
    panel.querySelector('.notes-add-btn')?.addEventListener('click', () => {
      _openNoteEditor({ id: null, title: '', richBody: '', isPinned: false, targetDate: dateStr, dateCreated: null });
    });

    // Note card interactions
    panel.querySelectorAll('.note-card').forEach(card => _bindCardEvents(card, () => renderForDate(dateStr)));
  }

  // ── Note card ──────────────────────────────────────────────────────────────

  function _noteCard(note, inDayPanel) {
    const pinIcon = note.isPinned ? '📌' : '📍';
    const pinTitle = note.isPinned ? 'בטל נעיצה' : 'נעץ פתק';
    return `
      <div class="note-card ${note.isPinned ? 'note-card--pinned' : ''}" data-note-id="${_esc(note.id)}">
        <div class="note-card__header">
          <span class="note-card__title">${_esc(note.title || 'ללא כותרת')}</span>
          <div class="note-card__actions">
            <button class="btn btn--xs btn--ghost note-pin-btn" data-id="${_esc(note.id)}" title="${pinTitle}">${pinIcon}</button>
            <button class="btn btn--xs btn--ghost note-edit-btn" data-id="${_esc(note.id)}" title="ערוך פתק">✏️</button>
            <button class="btn btn--xs btn--danger-ghost note-del-btn" data-id="${_esc(note.id)}" title="מחק פתק">🗑️</button>
          </div>
        </div>
        <div class="note-card__body">${note.richBody || ''}</div>
        <div class="note-card__footer">
          ${note.targetDate ? `<span class="note-card__date">${note.targetDate}</span>` : ''}
          <span class="note-card__mtime">${_fmtDate(note.dateModified)}</span>
        </div>
      </div>`;
  }

  function _bindCardEvents(card, onRefresh) {
    const id = card.dataset.noteId;

    card.querySelector('.note-pin-btn')?.addEventListener('click', async () => {
      try {
        const allNotes = await Api.getNotes();
        const note = allNotes.find(n => n.id === id);
        if (!note) return;
        note.isPinned = !note.isPinned;
        await Api.saveNote(note);
        onRefresh();
      } catch (err) { alert(`שגיאה: ${err.message}`); }
    });

    card.querySelector('.note-edit-btn')?.addEventListener('click', async () => {
      try {
        const allNotes = await Api.getNotes();
        const note = allNotes.find(n => n.id === id);
        if (note) _openNoteEditor(note, onRefresh);
      } catch (err) { alert(`שגיאה: ${err.message}`); }
    });

    card.querySelector('.note-del-btn')?.addEventListener('click', async () => {
      if (!confirm('האם למחוק פתק זה?')) return;
      try {
        await Api.deleteNote(id);
        onRefresh();
        if (_drawerOpen) _loadDrawerNotes();
      } catch (err) { alert(`שגיאה: ${err.message}`); }
    });

    // Checkbox persistence in richBody
    card.querySelectorAll('.note-card__body input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', async () => {
        try {
          const allNotes = await Api.getNotes();
          const note = allNotes.find(n => n.id === id);
          if (!note) return;
          // Rebuild richBody from card's current DOM
          note.richBody = card.querySelector('.note-card__body').innerHTML;
          await Api.saveNote(note);
        } catch {}
      });
    });
  }

  // ── Bi-directional direction detection for checklist items ────────────────

  function _applyCheckItemDir(itemEl) {
    const span = itemEl.querySelector('span') || itemEl;
    const text  = span.textContent || '';
    const hasHebrew = /[֐-׾]/.test(text);
    if (hasHebrew) {
      itemEl.style.direction   = 'rtl';
      itemEl.style.textAlign   = 'right';
      itemEl.style.flexDirection = 'row-reverse';
    } else if (text.trim()) {
      itemEl.style.direction   = 'ltr';
      itemEl.style.textAlign   = 'left';
      itemEl.style.flexDirection = 'row';
    }
  }

  function _bindBodyDirDetection(bodyEl) {
    bodyEl.addEventListener('input', () => {
      bodyEl.querySelectorAll('.note-check-item').forEach(_applyCheckItemDir);
    });
  }

  // ── Note editor modal ─────────────────────────────────────────────────────

  function _openNoteEditor(note, onSaved) {
    const modal = document.getElementById('noteEditorModal');
    if (!modal) return;

    document.getElementById('noteEditorTitle').value   = note.title || '';
    document.getElementById('noteEditorPinned').checked = !!note.isPinned;

    const dateEl   = document.getElementById('noteEditorDate');
    const noDateCb = document.getElementById('noteEditorNoDate');
    // "no date" when creating from drawer/full-view (note.targetDate is null and no _currentDate context)
    const hasDate  = !!(note.targetDate || (note.id && _currentDate));
    noDateCb.checked  = !hasDate;
    dateEl.disabled   = !hasDate;
    dateEl.value      = hasDate ? (note.targetDate || _currentDate || '') : '';
    noDateCb.onchange = () => {
      dateEl.disabled = noDateCb.checked;
      if (noDateCb.checked) dateEl.value = '';
    };
    const body = document.getElementById('noteEditorBody');
    body.innerHTML = note.richBody || '';

    modal.classList.remove('hidden');
    document.getElementById('noteEditorTitle').focus();

    // Toolbar buttons
    const toolbar = document.getElementById('noteEditorToolbar');
    toolbar.querySelectorAll('[data-cmd]').forEach(btn => {
      btn.onclick = () => {
        const cmd = btn.dataset.cmd;
        if (cmd === 'checklist') {
          document.execCommand('insertHTML', false,
            '<div class="note-check-item"><input type="checkbox"> <span contenteditable="true"></span></div>');
        } else if (cmd === 'ul') {
          document.execCommand('insertUnorderedList');
        } else if (cmd === 'ol') {
          document.execCommand('insertOrderedList');
        } else {
          document.execCommand(cmd);
        }
        body.focus();
      };
    });

    // Smart checklist: Enter inside a checklist item spawns a new item
    const _onKeyDown = (e) => {
      if (e.key !== 'Enter') return;
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      const anchor = sel.getRangeAt(0).startContainer;
      const checkItem = (anchor.nodeType === 3 ? anchor.parentElement : anchor)
        ?.closest?.('.note-check-item');
      if (!checkItem) return;
      e.preventDefault();
      const newItem = document.createElement('div');
      newItem.className = 'note-check-item';
      newItem.innerHTML = '<input type="checkbox"> <span contenteditable="true"></span>';
      checkItem.after(newItem);
      const span = newItem.querySelector('span');
      _applyCheckItemDir(newItem); // initial direction (defaults to RTL until user types)
      const range = document.createRange();
      range.setStart(span, 0);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    };
    if (body._checklistHandler) body.removeEventListener('keydown', body._checklistHandler);
    body._checklistHandler = _onKeyDown;
    body.addEventListener('keydown', _onKeyDown);

    // Bi-directional direction detection for checklist items
    _bindBodyDirDetection(body);
    // Apply to any pre-existing items from saved richBody
    body.querySelectorAll('.note-check-item').forEach(_applyCheckItemDir);

    // Checkbox attribute sync — ensures checked state is serialised into .innerHTML
    if (body._checkboxHandler) body.removeEventListener('change', body._checkboxHandler);
    body._checkboxHandler = (e) => {
      if (e.target.type !== 'checkbox') return;
      if (e.target.checked) e.target.setAttribute('checked', 'checked');
      else                   e.target.removeAttribute('checked');
    };
    body.addEventListener('change', body._checkboxHandler);

    // Save — re-enable button before cloning to prevent disabled clone carry-over
    const saveBtn = document.getElementById('noteEditorSaveBtn');
    saveBtn.disabled = false;
    const newSave = saveBtn.cloneNode(true);
    saveBtn.replaceWith(newSave);
    newSave.addEventListener('click', async () => {
      const title      = document.getElementById('noteEditorTitle').value.trim() || 'ללא כותרת';
      const liveBody   = document.getElementById('noteEditorBody');
      const richBody   = liveBody ? liveBody.innerHTML : '';
      const noDateCb2  = document.getElementById('noteEditorNoDate');
      const targetDate = (noDateCb2 && noDateCb2.checked) ? null : (document.getElementById('noteEditorDate').value || null);
      const isPinned   = document.getElementById('noteEditorPinned').checked;
      try {
        newSave.disabled = true;
        await Api.saveNote({ id: note.id, title, richBody, targetDate, isPinned, dateCreated: note.dateCreated });
        newSave.disabled = false;
        modal.classList.add('hidden');
        if (onSaved) onSaved();
        else if (_currentDate) renderForDate(_currentDate);
        if (_drawerOpen) _loadDrawerNotes();
      } catch (err) {
        newSave.disabled = false;
        alert(`שגיאה בשמירה: ${err.message}`);
      }
    });

    const cancelBtn = document.getElementById('noteEditorCancelBtn');
    const newCancel = cancelBtn.cloneNode(true);
    cancelBtn.replaceWith(newCancel);
    newCancel.addEventListener('click', () => modal.classList.add('hidden'));
  }

  // ── Global drawer ──────────────────────────────────────────────────────────

  function _toggleDrawer() {
    const drawer = document.getElementById('notesDrawer');
    if (!drawer) return;
    _drawerOpen = !_drawerOpen;
    drawer.classList.toggle('notes-drawer--open', _drawerOpen);
    if (_drawerOpen) _loadDrawerNotes();
  }

  async function _loadDrawerNotes() {
    const container = document.getElementById('notesDrawerList');
    if (!container) return;
    try {
      _allNotes = await Api.getNotes();
      _renderDrawer(container);
    } catch (err) {
      container.innerHTML = `<p class="placeholder-text error-text">שגיאה: ${_esc(err.message)}</p>`;
    }
  }

  function _renderDrawer(container) {
    const q = _drawerSearch.toLowerCase();
    const visible = _allNotes.filter(n =>
      !q || (n.title || '').toLowerCase().includes(q) ||
             (n.richBody || '').replace(/<[^>]+>/g, '').toLowerCase().includes(q));

    const sorted = _sortNotes(visible, _sortMode);
    if (!sorted.length) {
      container.innerHTML = `<p class="placeholder-text" style="font-size:0.85rem">${q ? 'לא נמצאו תוצאות' : 'אין פתקיות'}</p>`;
      return;
    }
    container.innerHTML = sorted.map(n => _noteCard(n, false)).join('');
    container.querySelectorAll('.note-card').forEach(card =>
      _bindCardEvents(card, _loadDrawerNotes));
  }

  // ── Sort helper ────────────────────────────────────────────────────────────

  function _sortNotes(notes, mode) {
    return [...notes].sort((a, b) => {
      if (mode === 'pinned') {
        if (!!a.isPinned !== !!b.isPinned) return a.isPinned ? -1 : 1;
      }
      return new Date(b.dateModified) - new Date(a.dateModified);
    });
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  function init() {
    // Drawer toggle button
    document.getElementById('notesDrawerToggle')?.addEventListener('click', _toggleDrawer);

    // Drawer close button
    document.getElementById('notesDrawerClose')?.addEventListener('click', () => {
      _drawerOpen = false;
      document.getElementById('notesDrawer')?.classList.remove('notes-drawer--open');
    });

    // Drawer search
    document.getElementById('notesDrawerSearch')?.addEventListener('input', (e) => {
      _drawerSearch = e.target.value.trim();
      const container = document.getElementById('notesDrawerList');
      if (container) _renderDrawer(container);
    });

    // Drawer search button
    document.getElementById('notesDrawerSearchBtn')?.addEventListener('click', () => {
      _drawerSearch = (document.getElementById('notesDrawerSearch')?.value || '').trim();
      const container = document.getElementById('notesDrawerList');
      if (container) _renderDrawer(container);
    });

    // Drawer new note button
    document.getElementById('notesDrawerAddBtn')?.addEventListener('click', () => {
      _openNoteEditor({ id: null, title: '', richBody: '', isPinned: false, targetDate: null, dateCreated: null },
        _loadDrawerNotes);
    });
  }

  // ── Full-screen notes view ─────────────────────────────────────────────────

  let _fullViewBound = false;
  let _fullViewSearch = '';
  let _fullViewSort   = 'modified';

  async function initFullView() {
    const container = document.getElementById('notesFullList');
    if (!container) return;

    if (!_fullViewBound) {
      _fullViewBound = true;
      document.getElementById('notesFullAddBtn')?.addEventListener('click', () => {
        // Use _loadAllAndRender so the freshly-created note is fetched from the
        // server before re-rendering (prevents new notes from being invisible).
        _openNoteEditor(
          { id: null, title: '', richBody: '', isPinned: false, targetDate: null, dateCreated: null },
          _loadAllAndRender,
        );
      });
      document.getElementById('notesFullSearch')?.addEventListener('input', (e) => {
        _fullViewSearch = e.target.value.trim();
        _renderFullView();
      });
      document.getElementById('notesFullSearchBtn')?.addEventListener('click', () => {
        _fullViewSearch = (document.getElementById('notesFullSearch')?.value || '').trim();
        _renderFullView();
      });
      document.getElementById('notesFullSort')?.addEventListener('change', (e) => {
        _fullViewSort = e.target.value;
        _renderFullView();
      });
    }

    container.innerHTML = '<p class="placeholder-text">טוען פתקיות...</p>';
    try {
      _allNotes = await Api.getNotes();
      _renderFullView();
    } catch (err) {
      container.innerHTML = `<p class="placeholder-text error-text">שגיאה: ${_esc(err.message)}</p>`;
    }
  }

  function _renderFullView() {
    const container = document.getElementById('notesFullList');
    if (!container) return;
    const q = _fullViewSearch.toLowerCase();
    const visible = _allNotes.filter(n =>
      !q || (n.title || '').toLowerCase().includes(q) ||
             (n.richBody || '').replace(/<[^>]+>/g, '').toLowerCase().includes(q));
    const sorted = _sortNotes(visible, _fullViewSort);
    if (!sorted.length) {
      container.innerHTML = `<p class="placeholder-text">${q ? 'לא נמצאו תוצאות' : 'אין פתקיות — צור פתק חדש'}</p>`;
      return;
    }
    container.innerHTML = `<div class="notes-full-grid">${sorted.map(n => _noteCard(n, false)).join('')}</div>`;
    container.querySelectorAll('.note-card').forEach(card =>
      _bindCardEvents(card, () => { _loadAllAndRender(); }),
    );
  }

  async function _loadAllAndRender() {
    try {
      _allNotes = await Api.getNotes();
      _renderFullView();
      if (_drawerOpen) _loadDrawerNotes();
    } catch {}
  }

  return { init, renderForDate, initFullView };
})();
