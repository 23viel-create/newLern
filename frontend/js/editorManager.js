// עורך סיכומים — Rich Text, ניווט רציף, הקלטות שמע, ייבוא בתפזורת
const EditorManager = (() => {

  // ─── מצב פנימי ───────────────────────────────────────────────────────────────

  let currentNode  = null;   // { path, title, ... }
  let flatList     = [];     // כל הסיכומים ברצף לניווט
  let prevNode     = null;
  let nextNode     = null;
  let isDirty      = false;
  let saveTimer    = null;

  // הקלטה
  let mediaRecorder   = null;
  let audioChunks     = [];
  let recordingTimer  = null;
  let recordingSeconds = 0;

  // ─── עזרים ───────────────────────────────────────────────────────────────────

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function debounce(fn, ms) {
    return (...args) => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => fn(...args), ms);
    };
  }

  function fmtTime(sec) {
    const m = String(Math.floor(sec / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    return `${m}:${s}`;
  }

  function setSaveStatus(state) {
    const el = document.getElementById('editorSaveStatus');
    if (!el) return;
    el.className = `save-status save-status--${state}`;
    el.textContent = { saving: 'שומר...', saved: 'נשמר ✓', error: 'שגיאה בשמירה!' }[state] || '';
  }

  // ─── פתיחת עורך ──────────────────────────────────────────────────────────────

  async function open(node, list) {
    currentNode = node;
    flatList    = list || [];

    // חשב שכנים
    const idx = flatList.findIndex(n => n.path === node.path);
    prevNode  = idx > 0              ? flatList[idx - 1] : null;
    nextNode  = idx < flatList.length - 1 ? flatList[idx + 1] : null;

    document.body.classList.add('editor-open');
    WindowManager.showView('editor');
    _updateNav();

    // טען תוכן
    const editor = document.getElementById('editorContent');
    editor.innerHTML = '<p class="placeholder-text">טוען...</p>';
    try {
      const html = await Api.getContent(node.path);
      editor.innerHTML = html || '';
      if (!html) editor.focus();
    } catch {
      editor.innerHTML = '';
    }

    isDirty = false;
    setSaveStatus('saved');
    await _loadAudioList();
  }

  function _updateNav() {
    document.getElementById('editorTitle').textContent = currentNode?.title || '—';
    const prevBtn = document.getElementById('editorPrevBtn');
    const nextBtn = document.getElementById('editorNextBtn');
    prevBtn.disabled = !prevNode;
    nextBtn.disabled = !nextNode;
    prevBtn.title = prevNode ? `הקודם: ${prevNode.title}` : 'אין סיכום קודם';
    nextBtn.title = nextNode ? `הבא: ${nextNode.title}`   : 'אין סיכום הבא';
  }

  // ─── שמירה ───────────────────────────────────────────────────────────────────

  const debouncedSave = debounce(_save, 1500);

  async function _save() {
    if (!currentNode || !isDirty) return;
    setSaveStatus('saving');
    try {
      const html = document.getElementById('editorContent').innerHTML;
      await Api.saveContent(currentNode.path, html);
      isDirty = false;
      setSaveStatus('saved');
    } catch {
      setSaveStatus('error');
    }
  }

  // ─── אתחול אירועים ───────────────────────────────────────────────────────────

  function init() {
    _bindEditorEvents();
    _bindNavEvents();
    _bindAudioEvents();
    _bindBulkImportEvents();
  }

  function _bindEditorEvents() {
    const editor  = document.getElementById('editorContent');
    const toolbar = document.getElementById('editorToolbar');

    // הפעלת styleWithCSS לשימוש ב-span style במקום תגי font ישנים
    document.addEventListener('selectionchange', () => {
      try { document.execCommand('styleWithCSS', false, true); } catch {}
    });

    editor.addEventListener('input', () => {
      isDirty = true;
      setSaveStatus('saving');
      debouncedSave();
    });

    // ניווט מקלדת
    editor.addEventListener('keydown', (e) => {
      if ((e.altKey) && e.key === 'ArrowLeft')  { e.preventDefault(); navigatePrev(); }
      if ((e.altKey) && e.key === 'ArrowRight') { e.preventDefault(); navigateNext(); }
      // Ctrl+S — שמור ידנית
      if (e.ctrlKey && e.key === 's') { e.preventDefault(); _save(); }
    });

    // placeholder כאשר ריק
    editor.addEventListener('focus', () => editor.classList.remove('is-empty'));
    editor.addEventListener('blur',  () => {
      editor.classList.toggle('is-empty', !editor.textContent.trim() && !editor.innerHTML.trim());
    });

    // סרגל עיצוב — כפתורי פורמט
    toolbar.addEventListener('mousedown', (e) => {
      const btn = e.target.closest('.fmt-btn');
      if (!btn) return;
      e.preventDefault(); // שמור selection
      try { document.execCommand('styleWithCSS', false, true); } catch {}
      document.execCommand(btn.dataset.cmd, false, null);
      editor.focus();
      _updateToolbarState();
    });

    // גופן
    document.getElementById('editorFontFamily').addEventListener('change', (e) => {
      try { document.execCommand('styleWithCSS', false, true); } catch {}
      document.execCommand('fontName', false, e.target.value);
      editor.focus();
    });

    // גודל גופן
    document.getElementById('editorFontSize').addEventListener('change', (e) => {
      _applyFontSize(e.target.value);
      editor.focus();
    });

    editor.addEventListener('keyup',    _updateToolbarState);
    editor.addEventListener('mouseup',  _updateToolbarState);

    // כפתור חזרה
    document.getElementById('editorBackBtn').addEventListener('click', async () => {
      if (isDirty) await _save();
      document.body.classList.remove('editor-open');
      WindowManager.showView('summaries');
    });

    // פתח ב-Word
    document.getElementById('openInWordBtn').addEventListener('click', async () => {
      if (!currentNode) return;
      const btn = document.getElementById('openInWordBtn');
      btn.disabled = true;
      btn.textContent = 'פותח...';
      try {
        if (isDirty) await _save();
        const html = document.getElementById('editorContent').innerHTML;
        await Api.openInWord(currentNode.path, currentNode.title || currentNode.path, html);
      } catch (err) {
        alert(`שגיאה בפתיחת Word: ${err.message}`);
      } finally {
        btn.disabled = false;
        btn.textContent = '📂 פתח ב-Word';
      }
    });
  }

  function _applyFontSize(px) {
    // execCommand fontSize uses 1-7 scale; we wrap the selection in a span with inline style
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return;
    try {
      document.execCommand('styleWithCSS', false, true);
      document.execCommand('fontSize', false, '7'); // placeholder
      // Replace the giant font7 spans with our desired px size
      document.getElementById('editorContent')
        .querySelectorAll('[size="7"], font[size="7"]')
        .forEach(el => {
          el.removeAttribute('size');
          el.style.fontSize = px;
        });
    } catch {}
  }

  function _updateToolbarState() {
    const cmds = ['bold', 'italic', 'underline'];
    cmds.forEach(cmd => {
      const btn = document.querySelector(`.fmt-btn[data-cmd="${cmd}"]`);
      if (btn) btn.classList.toggle('fmt-btn--active', document.queryCommandState(cmd));
    });
  }

  // ─── ניווט רציף ──────────────────────────────────────────────────────────────

  function _bindNavEvents() {
    document.getElementById('editorPrevBtn').addEventListener('click', navigatePrev);
    document.getElementById('editorNextBtn').addEventListener('click', navigateNext);
  }

  async function navigatePrev() {
    if (!prevNode) return;
    if (isDirty) await _save();
    await open(prevNode, flatList);
  }

  async function navigateNext() {
    if (!nextNode) return;
    if (isDirty) await _save();
    await open(nextNode, flatList);
  }

  // ─── הקלטות שמע ──────────────────────────────────────────────────────────────

  function _bindAudioEvents() {
    document.getElementById('recordBtn').addEventListener('click', _startRecording);
    document.getElementById('stopRecordBtn').addEventListener('click', _stopRecording);
    document.getElementById('audioUploadInput').addEventListener('change', _handleAudioUpload);

    document.getElementById('audioList').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-audio-action]');
      if (!btn) return;
      const action   = btn.dataset.audioAction;
      const filename = btn.dataset.filename;
      if (action === 'delete-audio') await _deleteAudio(filename);
    });
  }

  async function _startRecording() {
    if (mediaRecorder) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream, { mimeType: _pickMimeType() });
      audioChunks   = [];
      mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
      mediaRecorder.onstop = _finishRecording;
      mediaRecorder.start(250);

      recordingSeconds = 0;
      document.getElementById('recordingTime').textContent = fmtTime(0);
      document.getElementById('recordingStatus').classList.remove('hidden');
      document.getElementById('recordBtn').disabled = true;

      recordingTimer = setInterval(() => {
        recordingSeconds++;
        document.getElementById('recordingTime').textContent = fmtTime(recordingSeconds);
      }, 1000);
    } catch {
      alert('לא ניתן לגשת למיקרופון. בדוק הרשאות דפדפן.');
    }
  }

  function _stopRecording() {
    if (!mediaRecorder) return;
    clearInterval(recordingTimer);
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach(t => t.stop());
    document.getElementById('recordingStatus').classList.add('hidden');
    document.getElementById('recordBtn').disabled = false;
  }

  async function _finishRecording() {
    const mimeType = mediaRecorder.mimeType || 'audio/webm';
    const ext      = mimeType.includes('ogg') ? '.ogg' : mimeType.includes('mp4') ? '.mp4' : '.webm';
    const blob     = new Blob(audioChunks, { type: mimeType });
    const filename = `הקלטה_${new Date().toLocaleString('he-IL').replace(/[/:, ]/g, '-')}${ext}`;
    mediaRecorder = null;
    audioChunks   = [];
    try {
      await Api.uploadAudio(currentNode.path, blob, filename);
      await _loadAudioList();
    } catch (err) {
      alert(`שגיאה בשמירת ההקלטה: ${err.message}`);
    }
  }

  function _pickMimeType() {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg', 'audio/mp4'];
    return candidates.find(t => MediaRecorder.isTypeSupported(t)) || '';
  }

  async function _handleAudioUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !currentNode) return;
    e.target.value = '';
    try {
      await Api.uploadAudio(currentNode.path, file, file.name);
      await _loadAudioList();
    } catch (err) {
      alert(`שגיאה בהעלאת הקובץ: ${err.message}`);
    }
  }

  async function _loadAudioList() {
    if (!currentNode) return;
    const list = document.getElementById('audioList');
    try {
      const files = await Api.getAudioList(currentNode.path);
      if (!files.length) {
        list.innerHTML = '<li class="audio-empty placeholder-text">אין הקלטות</li>';
        return;
      }
      list.innerHTML = files.map((f, i) => `
        <li class="audio-item">
          <div class="audio-item__header">
            <span class="audio-item__name">🔊 הקלטה ${i + 1}</span>
            <button class="btn btn--xs btn--danger-ghost"
                    data-audio-action="delete-audio"
                    data-filename="${esc(f.filename)}"
                    title="מחק הקלטה">🗑️</button>
          </div>
          <audio class="audio-item__player" controls preload="none"
                 src="${esc(Api.audioFileUrl(currentNode.path, f.filename))}"></audio>
          <span class="audio-item__meta">${new Date(f.recordedAt).toLocaleString('he-IL')}</span>
        </li>`).join('');
    } catch {
      list.innerHTML = '<li class="audio-empty placeholder-text error-text">שגיאה בטעינת הקלטות</li>';
    }
  }

  async function _deleteAudio(filename) {
    const ok = await WindowManager.confirm(`האם למחוק את הקלטה "${filename}"?`);
    if (!ok) return;
    try {
      await Api.deleteAudio(currentNode.path, filename);
      await _loadAudioList();
    } catch (err) {
      alert(`שגיאה: ${err.message}`);
    }
  }

  // ─── ייבוא בתפזורת ───────────────────────────────────────────────────────────

  function _bindBulkImportEvents() {
    document.getElementById('bulkImportBtn').addEventListener('click', _openBulkModal);

    document.getElementById('bulkFileInput').addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      document.getElementById('bulkContent').value = text;
      _updateBulkPreview();
    });

    document.getElementById('bulkContent').addEventListener('input', _updateBulkPreview);
    document.getElementById('bulkDelimiter').addEventListener('input', _updateBulkPreview);
    document.getElementById('bulkPreviewBtn').addEventListener('click', _updateBulkPreview);
    document.getElementById('bulkCancelBtn').addEventListener('click', _closeBulkModal);
    document.getElementById('bulkImportModal')
      .querySelector('.modal__overlay')
      .addEventListener('click', _closeBulkModal);

    document.getElementById('bulkConfirmBtn').addEventListener('click', _executeBulkImport);
  }

  async function _openBulkModal() {
    // בנה רשימת תיקיות לבחירה
    const select = document.getElementById('bulkParentSelect');
    try {
      const tree = await Api.getTree();
      const folders = [{ path: '', title: '/ (שורש)' }];
      _collectFolders(tree, folders);
      select.innerHTML = folders
        .map(f => `<option value="${esc(f.path)}">${esc(f.title)}</option>`)
        .join('');
      // ברירת מחדל: תיקיית הסיכום הנוכחי
      if (currentNode) {
        const parentPath = currentNode.path.includes('/')
          ? currentNode.path.slice(0, currentNode.path.lastIndexOf('/'))
          : '';
        const opt = select.querySelector(`option[value="${CSS.escape(parentPath)}"]`);
        if (opt) opt.selected = true;
      }
    } catch { select.innerHTML = '<option value="">שגיאה בטעינת תיקיות</option>'; }

    document.getElementById('bulkPreview').classList.add('hidden');
    document.getElementById('bulkImportModal').classList.remove('hidden');
  }

  function _collectFolders(nodes, out, prefix = '') {
    for (const n of nodes) {
      if (n.type === 'folder') {
        out.push({ path: n.path, title: `${prefix}${n.title}` });
        if (n.children) _collectFolders(n.children, out, `${prefix}  `);
      }
    }
  }

  function _closeBulkModal() {
    document.getElementById('bulkImportModal').classList.add('hidden');
  }

  function _updateBulkPreview() {
    const content   = document.getElementById('bulkContent').value;
    const delimiter = document.getElementById('bulkDelimiter').value;
    const preview   = document.getElementById('bulkPreview');
    const countEl   = document.getElementById('bulkPreviewCount');
    if (!content.trim() || !delimiter) {
      preview.classList.add('hidden');
      return;
    }
    const parts = content.split(delimiter).map(s => s.trim()).filter(Boolean);
    countEl.textContent = `יצור ${parts.length} סיכומים`;
    preview.classList.remove('hidden');
  }

  async function _executeBulkImport() {
    const parentPath = document.getElementById('bulkParentSelect').value;
    const content    = document.getElementById('bulkContent').value;
    const delimiter  = document.getElementById('bulkDelimiter').value.trim();
    const baseName   = document.getElementById('bulkBaseName').value.trim();
    const fileInput  = document.getElementById('bulkFileInput');

    if (!delimiter) { alert('יש להזין מפריד'); return; }

    const btn = document.getElementById('bulkConfirmBtn');
    btn.disabled = true;
    btn.textContent = 'מייבא...';
    try {
      let created;
      if (fileInput.files?.[0]) {
        created = await Api.bulkImportFile(parentPath, fileInput.files[0], delimiter, baseName);
      } else {
        if (!content.trim()) { alert('יש להזין תוכן לייבוא'); return; }
        created = await Api.bulkImportText(parentPath, content, delimiter, baseName);
      }
      _closeBulkModal();
      alert(`יובאו ${created.length} סיכומים בהצלחה`);
      // עדכן עץ
      if (window.SummariesManager) await SummariesManager.loadTree();
    } catch (err) {
      alert(`שגיאה בייבוא: ${err.message}`);
    } finally {
      btn.disabled = false;
      btn.textContent = 'ייבא';
    }
  }

  // ─── ממשק ציבורי ─────────────────────────────────────────────────────────────

  function clear() {
    if (isDirty) _save();
    currentNode = null;
    prevNode = null;
    nextNode = null;
    isDirty = false;
    const editor = document.getElementById('editorContent');
    if (editor) editor.innerHTML = '';
    document.getElementById('editorTitle').textContent = '—';
    setSaveStatus('saved');
    document.getElementById('audioList').innerHTML =
      '<li class="audio-empty placeholder-text">אין הקלטות</li>';
    document.body.classList.remove('editor-open');
  }

  return { init, open, clear, getCurrentNode: () => currentNode };
})();
