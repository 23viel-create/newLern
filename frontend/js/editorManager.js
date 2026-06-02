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

  function _sanitizePastedHtml(html) {
    const ALLOWED = /^(p|b|i|u|ul|ol|li|br|strong|em)$/i;
    let s = html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '');
    s = s.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*?)>/g, (_, slash, tag, attrs) => {
      const t = tag.toLowerCase();
      if (!ALLOWED.test(t)) return '';
      if (slash) return `</${t}>`;
      const href = attrs.match(/\bhref="([^"]*)"/i);
      const src  = attrs.match(/\bsrc="([^"]*)"/i);
      let kept = '';
      if (href) kept += ` href="${href[1]}"`;
      if (src)  kept += ` src="${src[1]}"`;
      return `<${t}${kept}>`;
    });
    return s.trim();
  }

  // ─── פתיחת עורך ──────────────────────────────────────────────────────────────

  async function open(node, list) {
    _aiEdit.deactivate();
    currentNode = node;
    flatList    = list || [];

    // חשב שכנים
    const idx = flatList.findIndex(n => n.path === node.path);
    prevNode  = idx > 0              ? flatList[idx - 1] : null;
    nextNode  = idx < flatList.length - 1 ? flatList[idx + 1] : null;

    document.body.classList.add('editor-open');
    WindowManager.showView('editor');
    if (typeof AiManager !== 'undefined') AiManager.setContext('editor');
    if (typeof AppGuideManager !== 'undefined') AppGuideManager.updateScreen('editor');
    _updateNav();
    document.getElementById('editorToolbar')?.classList.remove('hidden');
    _ensureToolbar();

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

  // ─── שחזור סרגל עיצוב אם נמחק ───────────────────────────────────────────────

  const _TOOLBAR_HTML = `
    <button class="fmt-btn" data-cmd="bold"               title="מודגש (Ctrl+B)"><b>ב</b></button>
    <button class="fmt-btn" data-cmd="italic"             title="נטוי (Ctrl+I)"><i>נ</i></button>
    <button class="fmt-btn" data-cmd="underline"          title="קו תחתון (Ctrl+U)"><u>ק</u></button>
    <span class="toolbar-sep"></span>
    <select id="editorFontFamily" class="select-field select-field--sm" title="גופן">
      <option value="Arial, sans-serif">Arial</option>
      <option value="'David', serif">David</option>
      <option value="'Times New Roman', serif">Times</option>
      <option value="'Courier New', monospace">Courier</option>
    </select>
    <select id="editorFontSize" class="select-field select-field--sm" title="גודל גופן">
      <option value="12px">12</option>
      <option value="14px">14</option>
      <option value="16px" selected>16</option>
      <option value="18px">18</option>
      <option value="20px">20</option>
      <option value="24px">24</option>
      <option value="32px">32</option>
    </select>
    <span class="toolbar-sep"></span>
    <button class="fmt-btn" data-cmd="insertUnorderedList" title="רשימה">•≡</button>
    <button class="fmt-btn" data-cmd="insertOrderedList"   title="רשימה ממוספרת">1≡</button>
    <span class="toolbar-sep"></span>
    <button class="fmt-btn" data-cmd="justifyRight"  title="יישור לימין">⬛R</button>
    <button class="fmt-btn" data-cmd="justifyCenter" title="מרכוז">⬛C</button>
    <button class="fmt-btn" data-cmd="justifyLeft"   title="יישור לשמאל">⬛L</button>
    <span class="toolbar-sep"></span>
    <button class="fmt-btn fmt-btn--hl" data-cmd="hiliteColor" data-value="#FFFF66" title="הדגשה צהובה" style="background:#FFFF66;min-width:22px">A</button>
    <button class="fmt-btn fmt-btn--hl" data-cmd="hiliteColor" data-value="#90EE90" title="הדגשה ירוקה" style="background:#90EE90;min-width:22px">A</button>
    <button class="fmt-btn fmt-btn--hl" data-cmd="hiliteColor" data-value="#ADD8E6" title="הדגשה כחולה" style="background:#ADD8E6;min-width:22px">A</button>
    <button class="fmt-btn fmt-btn--hl" data-cmd="hiliteColor" data-value="transparent" title="הסר הדגשה">✕HL</button>
    <span class="toolbar-sep"></span>
    <button class="fmt-btn" id="insertImageBtn" title="הוסף תמונה">🖼️</button>
    <input type="file" id="imageUploadInput" accept="image/*" hidden />
    <span class="toolbar-sep"></span>
    <button class="fmt-btn" data-cmd="removeFormat" title="נקה עיצוב">✕</button>`;

  function _ensureToolbar() {
    let tb = document.getElementById('editorToolbar');

    // Nuclear option: create and insert the toolbar if it was removed from DOM entirely
    if (!tb) {
      tb = document.createElement('div');
      tb.id = 'editorToolbar';
      tb.className = 'editor-toolbar';
      // Toolbar now lives inside .editor-main, above #editorContent
      const editorMain = document.querySelector('.editor-main');
      if (editorMain) {
        const content = document.getElementById('editorContent');
        editorMain.insertBefore(tb, content || editorMain.firstChild);
      } else {
        // Last resort: insert right before the editor body
        const body = document.getElementById('editorBody');
        if (body) body.parentNode.insertBefore(tb, body);
      }
    }

    // Rebuild buttons if toolbar was wiped empty
    if (!tb.querySelector('.fmt-btn')) {
      tb.innerHTML = _TOOLBAR_HTML;
      // Re-bind font selectors for the freshly injected DOM
      const ffSel = document.getElementById('editorFontFamily');
      const fsSel = document.getElementById('editorFontSize');
      if (ffSel) ffSel.addEventListener('change', (e) => {
        try { document.execCommand('styleWithCSS', false, true); } catch {}
        document.execCommand('fontName', false, e.target.value);
        document.getElementById('editorContent')?.focus();
      });
      if (fsSel) fsSel.addEventListener('change', (e) => {
        _applyFontSize(e.target.value);
        document.getElementById('editorContent')?.focus();
      });
    }

    // Force visibility with both inline style and CSS class regardless of cascade
    tb.style.cssText = 'display:flex !important; flex-wrap:wrap; gap:8px; padding:8px; background-color:#eef1f6; border-bottom:1px solid #ccc; width:100%; min-height:45px; z-index:100; box-sizing:border-box; visibility:visible; opacity:1;';
  }

  // ─── אתחול אירועים ───────────────────────────────────────────────────────────

  function init() {
    document.getElementById('editorToolbar')?.classList.remove('hidden');
    _bindEditorEvents();
    _bindNavEvents();
    _bindAudioEvents();
    _bindBulkImportEvents();
    _aiEdit.init();
  }

  function _bindEditorEvents() {
    const editor  = document.getElementById('editorContent');
    if (!editor) return;
    // toolbar lookup is deferred — _ensureToolbar() in open() guarantees it exists
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

    // Paste interceptor — strip Word/Office HTML bloat before insertion
    editor.addEventListener('paste', (e) => {
      e.preventDefault();
      const html  = e.clipboardData.getData('text/html');
      const plain = e.clipboardData.getData('text/plain');
      let clean;
      if (html) {
        clean = _sanitizePastedHtml(html);
      } else {
        clean = plain
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/\n/g, '<br>');
      }
      if (clean) document.execCommand('insertHTML', false, clean);
    });

    // סרגל עיצוב — delegate on .editor-main (static ancestor of toolbar's new location).
    // e.preventDefault() on mousedown is CRITICAL: prevents focus theft so selection survives.
    const editorMain = document.querySelector('.editor-main');
    (editorMain || toolbar || document).addEventListener('mousedown', (e) => {
      const btn = e.target.closest('.fmt-btn');
      if (!btn) return;
      e.preventDefault(); // שמור selection — בלי זה execCommand נכשל
      try { document.execCommand('styleWithCSS', false, true); } catch {}
      // Support data-value for commands like hiliteColor that need a parameter
      const cmdValue = btn.hasAttribute('data-value') ? btn.dataset.value : null;
      document.execCommand(btn.dataset.cmd, false, cmdValue);
      editor.focus();
      _updateToolbarState();
    });

    // תמונה — קרא קובץ כ-DataURL והכנס ל-editor
    document.getElementById('insertImageBtn')?.addEventListener('click', () => {
      document.getElementById('imageUploadInput')?.click();
    });
    document.getElementById('imageUploadInput')?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) { alert('קובץ גדול מדי — מקסימום 5MB'); return; }
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target.result;
        editor.focus();
        document.execCommand('insertHTML', false,
          `<img src="${dataUrl}" style="max-width:100%;height:auto;display:block;margin:4px 0" alt="תמונה" />`);
      };
      reader.readAsDataURL(file);
      e.target.value = ''; // allow re-upload of same file
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
    editor.addEventListener('mouseup',  (e) => { _updateToolbarState(); _onEditorMouseUp(e); });

    // ─── מיני-סרגל AI לטקסט מסומן ─────────────────────────────────────────────
    let _miniBar = null;
    function _ensureMiniBar() {
      if (_miniBar) return _miniBar;
      _miniBar = document.createElement('div');
      _miniBar.className = 'ai-selection-bar';
      _miniBar.setAttribute('dir', 'rtl');
      _miniBar.innerHTML =
        `<button type="button" class="ai-sel-btn" data-action="translate">🌐 תרגם</button>` +
        `<button type="button" class="ai-sel-btn" data-action="questions">❓ שאלות</button>`;
      document.body.appendChild(_miniBar);
      _miniBar.querySelectorAll('.ai-sel-btn').forEach(btn => {
        btn.addEventListener('mousedown', e => e.preventDefault()); // preserve selection
        btn.addEventListener('click', () => {
          const selText = window.getSelection().toString().trim();
          _hideMiniBar();
          if (btn.dataset.action === 'translate') {
            _aiEdit.activateWithInstruction('תרגם לעברית');
          } else if (btn.dataset.action === 'questions') {
            // Pipeline: selection → bulk question bank directly
            if (selText && typeof QuizManager !== 'undefined') {
              QuizManager.openBulkGenWithSelection(currentNode?.path || null, selText);
            } else {
              _aiEdit.activateWithInstruction('צור שאלות בחינה מהקטע המסומן');
            }
          }
        });
      });
      return _miniBar;
    }
    function _hideMiniBar() {
      if (_miniBar) _miniBar.style.display = 'none';
    }
    function _onEditorMouseUp() {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.rangeCount > 0 && editor.contains(sel.anchorNode)) {
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) { _hideMiniBar(); return; }
        const bar = _ensureMiniBar();
        const barW = 170; // approximate width
        let left = rect.left + rect.width / 2 - barW / 2;
        left = Math.max(8, Math.min(left, window.innerWidth - barW - 8));
        const top = Math.max(8, rect.top - 48);
        bar.style.left = `${left}px`;
        bar.style.top  = `${top}px`;
        bar.style.display = 'flex';
      } else {
        _hideMiniBar();
      }
    }
    // Hide mini-bar when clicking elsewhere
    document.addEventListener('mousedown', (e) => {
      if (_miniBar && !_miniBar.contains(e.target)) _hideMiniBar();
    });

    // כפתור חזרה
    document.getElementById('editorBackBtn').addEventListener('click', async () => {
      if (isDirty) await _save();
      document.body.classList.remove('editor-open');
      WindowManager.showView('summaries');
    });

    // סנכרן עם Word — ידני (קרא document.doc → עדכן עורך)
    document.getElementById('syncWithWordBtn')?.addEventListener('click', async () => {
      if (!currentNode) return;
      const btn = document.getElementById('syncWithWordBtn');
      btn.disabled = true;
      btn.textContent = '⏳ מסנכרן...';
      try {
        await Api.wordSyncManual(currentNode.path, currentNode.title);
        const cacheBustUrl = `/api/summaries/content?path=${encodeURIComponent(currentNode.path)}&_t=${Date.now()}`;
        const freshRes  = await fetch(cacheBustUrl);
        const freshData = await freshRes.json();
        const html = freshData.data || freshData.content || '';
        document.getElementById('editorContent').innerHTML = html;
        isDirty = false;
        setSaveStatus('saved');
        btn.textContent = '✓ סונכרן';
        setTimeout(() => { btn.textContent = '🔄 סנכרן עם Word'; btn.disabled = false; }, 2500);
      } catch (err) {
        alert(`שגיאה בסנכרון עם Word: ${err.message}`);
        btn.textContent = '🔄 סנכרן עם Word';
        btn.disabled = false;
      }
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

  // ─── AI Contextual Edit ───────────────────────────────────────────────────────

  const _aiEdit = (() => {
    let _savedRange    = null;
    let _highlightMark = null; // <mark> element wrapping the user's selection
    let _editMode      = 'INSERT'; // 'INSERT' | 'REPLACE'
    let _isActive      = false;

    const _el = {
      toggle:    () => document.getElementById('aiEditToggleBtn'),
      bar:       () => document.getElementById('aiEditBar'),
      results:   () => document.getElementById('aiEditResultsSection'),
      list:      () => document.getElementById('aiEditResultsList'),
      loading:   () => document.getElementById('aiEditLoadingMsg'),
      modeLabel: () => document.getElementById('aiEditModeLabel'),
      instr:     () => document.getElementById('aiEditInstruction'),
      vars:      () => document.getElementById('aiEditVariations'),
      submitBtn: () => document.getElementById('aiEditSubmitBtn'),
      panel:     () => document.getElementById('aiPanel'),
    };

    function _showBar() {
      const editor = document.getElementById('editorContent');

      // Capture selection BEFORE focus is stolen by the instruction input
      const sel = window.getSelection();
      if (editor && sel && sel.rangeCount > 0 &&
          editor.contains(sel.getRangeAt(0).commonAncestorContainer)) {
        const range = sel.getRangeAt(0).cloneRange();
        if (!range.collapsed) {
          // Wrap the selected text in a persistent visual highlight
          const mark = document.createElement('mark');
          mark.className = 'ai-temp-highlight';
          try {
            range.surroundContents(mark);
          } catch {
            // Range spans multiple block elements — extract then rewrap
            const frag = range.extractContents();
            mark.appendChild(frag);
            range.insertNode(mark);
          }
          _highlightMark = mark;
          _savedRange = document.createRange();
          _savedRange.selectNodeContents(mark);
        } else {
          _savedRange = range; // cursor-only INSERT position
          _highlightMark = null;
        }
      } else {
        _savedRange = null;
        _highlightMark = null;
      }

      _isActive = true;
      _el.toggle()?.classList.add('ai-edit--active');
      _el.bar()?.classList.remove('hidden');
      _el.instr()?.focus();
    }

    function deactivate() {
      _isActive = false;

      // Unwrap highlight mark, restoring the original text nodes
      if (_highlightMark && _highlightMark.parentNode) {
        const parent = _highlightMark.parentNode;
        while (_highlightMark.firstChild) {
          parent.insertBefore(_highlightMark.firstChild, _highlightMark);
        }
        parent.removeChild(_highlightMark);
        parent.normalize();
      }
      _highlightMark = null;
      _savedRange    = null;

      const editor = document.getElementById('editorContent');
      if (editor) {
        editor.contentEditable = 'true';
        editor.classList.remove('editor-content--locked');
      }

      _el.toggle()?.classList.remove('ai-edit--active');
      _el.bar()?.classList.add('hidden');
      _el.results()?.classList.add('hidden');
      _el.panel()?.classList.remove('ai-edit--results');

      const list = _el.list();
      if (list) { list.innerHTML = ''; delete list.dataset.variations; }
      const instr = _el.instr();
      if (instr) instr.value = '';
      _el.loading()?.classList.add('hidden');
    }

    async function _submit() {
      const instruction = _el.instr()?.value.trim();
      if (!instruction) { _el.instr()?.focus(); return; }

      const editor = document.getElementById('editorContent');
      if (!editor) return;

      // ── 1. Use the range captured at toggle-time (mark or cursor) ──────
      let range;
      if (_highlightMark && _highlightMark.parentNode) {
        range = document.createRange();
        range.selectNodeContents(_highlightMark);
        _savedRange = range;
      } else if (_savedRange) {
        range = _savedRange;
      } else {
        range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        _savedRange = range;
      }

      const selectedText = _highlightMark ? _highlightMark.textContent : range.toString();
      _editMode = selectedText.length > 0 ? 'REPLACE' : 'INSERT';

      // ── 2. Extract ±150-word context ────────────────────────────────────
      let beforeContext = '', afterContext = '';
      try {
        const br = document.createRange();
        br.setStart(editor, 0);
        br.setEnd(range.startContainer, range.startOffset);
        beforeContext = br.toString().trim().split(/\s+/).filter(Boolean).slice(-150).join(' ');
      } catch { /* empty doc */ }
      try {
        const ar = document.createRange();
        ar.setStart(range.endContainer, range.endOffset);
        ar.setEnd(editor, editor.childNodes.length);
        afterContext = ar.toString().trim().split(/\s+/).filter(Boolean).slice(0, 150).join(' ');
      } catch { /* empty doc */ }

      // ── 3. Lock editor ──────────────────────────────────────────────────
      editor.contentEditable = 'false';
      editor.classList.add('editor-content--locked');

      // ── 4. Show loading overlay ─────────────────────────────────────────
      _el.panel()?.classList.add('ai-edit--results');
      _el.results()?.classList.remove('hidden');
      const ml = _el.modeLabel();
      if (ml) ml.textContent = _editMode === 'REPLACE' ? '🔁 החלפה' : '➕ הוספה';
      _el.loading()?.classList.remove('hidden');
      const list = _el.list();
      if (list) list.innerHTML = '';

      const submitBtn = _el.submitBtn();
      if (submitBtn) submitBtn.disabled = true;

      const numberOfVariations = Number(_el.vars()?.value) || 3;

      // ── 5. Call API ─────────────────────────────────────────────────────
      try {
        const data = await Api.aiContextualEdit({
          beforeContext, selectedText, afterContext, instruction, numberOfVariations,
        });
        _el.loading()?.classList.add('hidden');
        _renderCards(data.variations || []);
      } catch (err) {
        _el.loading()?.classList.add('hidden');
        if (list) {
          list.innerHTML =
            `<p class="hint" style="color:var(--color-danger);padding:0.4rem 0">שגיאה: ${esc(err.message)}</p>`;
        }
        // Unlock so user can retry or cancel
        editor.contentEditable = 'true';
        editor.classList.remove('editor-content--locked');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    }

    function _renderCards(variations) {
      const list = _el.list();
      if (!list) return;
      list.innerHTML = '';
      list.dataset.variations = JSON.stringify(variations);

      const actionLabel = _editMode === 'REPLACE' ? 'החלף ✓' : 'הוסף ✓';

      variations.forEach((text, i) => {
        const card = document.createElement('div');
        card.className = 'ai-edit-card';
        card.innerHTML =
          `<div class="ai-edit-card__num">הצעה ${i + 1}</div>` +
          `<div class="ai-edit-card__text">${esc(text)}</div>` +
          `<div class="ai-edit-card__actions">` +
          `<button class="btn btn--primary btn--sm ai-edit-apply-btn" data-idx="${i}">${actionLabel}</button>` +
          `</div>`;
        list.appendChild(card);
      });

      list.querySelectorAll('.ai-edit-apply-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const vars = JSON.parse(list.dataset.variations || '[]');
          _inject(vars[Number(btn.dataset.idx)] || '');
        });
      });
    }

    function _inject(text) {
      const editor = document.getElementById('editorContent');
      if (!editor) return;

      // Unlock first
      editor.contentEditable = 'true';
      editor.classList.remove('editor-content--locked');

      const sel = window.getSelection();
      sel.removeAllRanges();

      try {
        let workRange;
        if (_highlightMark && _highlightMark.parentNode) {
          // Select and delete the highlight mark (replaces its entire content)
          workRange = document.createRange();
          workRange.selectNode(_highlightMark);
          workRange.deleteContents();
          _highlightMark = null; // prevent deactivate() from double-unwrapping
        } else if (_savedRange) {
          workRange = _savedRange.cloneRange();
          if (_editMode === 'REPLACE') workRange.deleteContents();
        } else {
          workRange = document.createRange();
          workRange.selectNodeContents(editor);
          workRange.collapse(false);
        }

        // Build fragment preserving newlines
        const frag = document.createDocumentFragment();
        text.split('\n').forEach((line, i) => {
          if (i > 0) frag.appendChild(document.createElement('br'));
          if (line)  frag.appendChild(document.createTextNode(line));
        });
        workRange.insertNode(frag);

        sel.addRange(workRange);
        sel.collapseToEnd();
      } catch (err) {
        console.error('[aiEdit] injection error:', err);
      }

      editor.focus();
      isDirty = true;
      setSaveStatus('saving');
      debouncedSave();

      deactivate();
    }

    function init() {
      document.getElementById('aiEditToggleBtn')
        ?.addEventListener('click', () => (_isActive ? deactivate() : _showBar()));
      document.getElementById('aiEditSubmitBtn')
        ?.addEventListener('click', _submit);
      document.getElementById('aiEditCancelBtn')
        ?.addEventListener('click', deactivate);
      document.getElementById('aiEditInstruction')
        ?.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _submit(); }
        });
    }

    function activateWithInstruction(instruction) {
      _showBar();
      const instrEl = document.getElementById('aiEditInstruction');
      if (instrEl) instrEl.value = instruction;
    }

    return { init, deactivate, activateWithInstruction };
  })();

  // ─── ממשק ציבורי ─────────────────────────────────────────────────────────────

  function clear() {
    _aiEdit.deactivate();
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
