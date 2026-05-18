// ─── מנהל מסך מפוצל בעורך ────────────────────────────────────────────────────
const SplitScreenManager = (() => {
  let _active = false;
  let _mode   = null; // 'summary' | 'book'
  let _editable = false;

  function _pane()        { return document.getElementById('splitPane'); }
  function _content()     { return document.getElementById('splitPaneContent'); }
  function _bookFrame()   { return document.getElementById('splitPaneBookFrame'); }
  function _iframe()      { return document.getElementById('splitBookIframe'); }
  function _picker()      { return document.getElementById('splitPanePicker'); }
  function _paneTitle()   { return document.getElementById('splitPaneTitle'); }
  function _unlockBtn()   { return document.getElementById('splitUnlockBtn'); }
  function _body()        { return document.getElementById('editorBody'); }

  function _show() {
    _pane()?.classList.remove('hidden');
    _body()?.classList.add('split-active');
    _active = true;
  }

  function _hide() {
    _pane()?.classList.add('hidden');
    _body()?.classList.remove('split-active');
    _iframe().src = 'about:blank';
    _active = false;
    _mode = null;
    _editable = false;
  }

  function _showPicker() {
    _content()?.classList.add('hidden');
    _bookFrame()?.classList.add('hidden');
    _picker()?.classList.remove('hidden');
    _unlockBtn()?.classList.add('hidden');
    _paneTitle().textContent = 'בחר תוכן למסך המפוצל';
    _show();
    _loadPickerItems();
  }

  async function _loadPickerItems() {
    // Load summaries
    const summaryList = document.getElementById('splitPickerList');
    const booksList   = document.getElementById('splitPickerBooks');
    summaryList.innerHTML = '<p class="placeholder-text" style="padding:0.4rem">טוען...</p>';
    booksList.innerHTML   = '<p class="placeholder-text" style="padding:0.4rem">טוען...</p>';

    try {
      const treeData = await Api.getTree();
      const items = _flattenNodes(Array.isArray(treeData) ? treeData : []);
      if (!items.length) {
        summaryList.innerHTML = '<p class="placeholder-text" style="padding:0.4rem">אין סיכומים</p>';
      } else {
        summaryList.innerHTML = items.map(it =>
          `<div class="split-picker-item" data-path="${escHtml(it.path)}" data-title="${escHtml(it.title)}">${escHtml(it.title)}</div>`
        ).join('');
        summaryList.querySelectorAll('.split-picker-item').forEach(el => {
          el.addEventListener('click', () => _openSummary(el.dataset.path, el.dataset.title));
        });
      }
    } catch {
      summaryList.innerHTML = '<p class="placeholder-text" style="padding:0.4rem">שגיאה בטעינה</p>';
    }

    try {
      const books = await Api.getBooks();
      if (!books.length) {
        booksList.innerHTML = '<p class="placeholder-text" style="padding:0.4rem">אין ספרים</p>';
      } else {
        booksList.innerHTML = books.map(b =>
          `<div class="split-picker-item" data-name="${escHtml(b.name)}">${_bookIcon(b.name)} ${escHtml(b.name)}</div>`
        ).join('');
        booksList.querySelectorAll('.split-picker-item').forEach(el => {
          el.addEventListener('click', () => _openBook(el.dataset.name));
        });
      }
    } catch {
      booksList.innerHTML = '<p class="placeholder-text" style="padding:0.4rem">שגיאה בטעינה</p>';
    }

    // search filter
    document.getElementById('splitPickerSearch')?.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      summaryList.querySelectorAll('.split-picker-item').forEach(el => {
        el.style.display = el.dataset.title.toLowerCase().includes(q) ? '' : 'none';
      });
    });
  }

  function _flattenNodes(nodes) {
    const result = [];
    for (const n of nodes) {
      if (n.type === 'summary') result.push({ path: n.path, title: n.title || n.name });
      if (n.children && n.children.length) result.push(..._flattenNodes(n.children));
    }
    return result;
  }

  function _bookIcon(name) {
    const ext = name.split('.').pop().toLowerCase();
    if (ext === 'docx') return '📝';
    if (ext === 'pptx') return '📊';
    return '📕';
  }

  async function _openSummary(summaryPath, title) {
    _mode = 'summary';
    _editable = false;
    _picker()?.classList.add('hidden');
    _bookFrame()?.classList.add('hidden');
    _content()?.classList.remove('hidden');
    _unlockBtn()?.classList.remove('hidden');
    _paneTitle().textContent = title;

    const c = _content();
    c.contentEditable = 'false';
    c.innerHTML = '<p class="placeholder-text">טוען...</p>';

    try {
      const rawContent = await Api.getContent(summaryPath);
      c.innerHTML = rawContent || '<p class="placeholder-text">(ריק)</p>';
    } catch (err) {
      c.innerHTML = `<p class="error-text">שגיאה: ${escHtml(err.message)}</p>`;
    }
  }

  function _openBook(name) {
    _mode = 'book';
    _editable = false;
    _picker()?.classList.add('hidden');
    _content()?.classList.add('hidden');
    _bookFrame()?.classList.remove('hidden');
    _unlockBtn()?.classList.add('hidden');
    _paneTitle().textContent = name;

    const ext = name.split('.').pop().toLowerCase();
    if (ext === 'pdf') {
      _iframe().src = Api.getBookStreamUrl(name);
    } else {
      _bookFrame().innerHTML = `<div class="book-viewer-fallback"><p class="hint">לא ניתן להציג קובץ זה ישירות.</p><a href="${Api.getBookStreamUrl(name)}" class="btn btn--primary" download="${escHtml(name)}">⬇️ הורד קובץ</a></div>`;
    }
  }

  function _toggleEditable() {
    if (_mode !== 'summary') return;
    _editable = !_editable;
    const c = _content();
    c.contentEditable = _editable ? 'true' : 'false';
    const btn = _unlockBtn();
    btn.textContent = _editable ? '🔒 נעל' : '🔓 ערוך';
    if (_editable) c.focus();
  }

  function init() {
    document.getElementById('splitScreenBtn')?.addEventListener('click', () => {
      if (_active) { _hide(); return; }
      _showPicker();
    });
    document.getElementById('splitCloseBtn')?.addEventListener('click', _hide);
    document.getElementById('splitUnlockBtn')?.addEventListener('click', _toggleEditable);
  }

  return { init };
})();
