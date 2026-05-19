// ─── מנהל מאגר ספרים (PDF / Word / PowerPoint) ──────────────────────────────
const BooksManager = (() => {
  let _bound = false;

  // ─── אתחול ──────────────────────────────────────────────────────────────────

  async function init() {
    if (!_bound) {
      _bindDropzone();
      _bindBooksControls();
      _bound = true;
    }
    await loadBooks();
  }

  // ─── ספרים שנבחרו לשימוש ב-AI ────────────────────────────────────────────────

  function getSelectedBooks() {
    return Array.from(
      document.querySelectorAll('.book-item__select:checked')
    ).map(cb => cb.dataset.bookName).filter(Boolean);
  }

  // ─── אזור גרירה ─────────────────────────────────────────────────────────────

  function _bindDropzone() {
    const dropzone  = document.getElementById('booksDropzone');
    const input     = document.getElementById('booksFileInput');
    const selectBtn = document.getElementById('booksSelectBtn');

    selectBtn.addEventListener('click', () => input.click());

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file) _uploadFile(file);
      input.value = '';
    });

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('books-dropzone--over');
    });
    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('books-dropzone--over');
    });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('books-dropzone--over');
      const file = e.dataTransfer.files[0];
      if (!file) return;
      const ext = file.name.split('.').pop().toLowerCase();
      if (!['pdf', 'docx', 'pptx'].includes(ext)) {
        alert('יש לגרור קובץ PDF, Word (.docx) או PowerPoint (.pptx) בלבד');
        return;
      }
      _uploadFile(file);
    });
  }

  // ─── העלאה ──────────────────────────────────────────────────────────────────

  async function _uploadFile(file) {
    const status = document.getElementById('booksUploadStatus');
    status.textContent = `⏳ מעלה את "${escHtml(file.name)}"...`;
    status.className = 'upload-status upload-status--loading';
    try {
      await Api.uploadBook(file);
      status.textContent = `✓ "${escHtml(file.name)}" הועלה בהצלחה`;
      status.className = 'upload-status upload-status--success';
      await loadBooks();
      setTimeout(() => { status.className = 'upload-status hidden'; }, 3500);
    } catch (err) {
      status.textContent = `שגיאה בהעלאה: ${escHtml(err.message)}`;
      status.className = 'upload-status upload-status--error';
    }
  }

  // ─── רשימת ספרים ────────────────────────────────────────────────────────────

  let _allBooks    = [];
  let _booksSearch = '';

  function _bindBooksControls() {
    document.getElementById('booksSearch')?.addEventListener('input', (e) => {
      _booksSearch = e.target.value.trim();
      _renderBooks();
    });
    document.getElementById('booksCreateFolderBtn')?.addEventListener('click', async () => {
      const name = await WindowManager.promptInput('שם התיקייה החדשה', 'לדוגמה: פוסקים');
      if (!name) return;
      try {
        await Api.createBooksFolder(name);
        await loadBooks();
      } catch (err) {
        alert(`שגיאה ביצירת תיקייה: ${err.message}`);
      }
    });
  }

  async function loadBooks() {
    const list = document.getElementById('booksList');
    list.innerHTML = '<p class="placeholder-text">טוען...</p>';
    try {
      _allBooks = await Api.getBooks();
      _renderBooks();
    } catch (err) {
      list.innerHTML = `<p class="placeholder-text error-text">שגיאה בטעינה: ${escHtml(err.message)}</p>`;
    }
  }

  function _renderBooks() {
    const list = document.getElementById('booksList');
    if (!list) return;
    const q = _booksSearch.toLowerCase();
    const visible = q
      ? _allBooks.filter(b =>
          (b.displayName || b.name).toLowerCase().includes(q) ||
          (b.folder || '').toLowerCase().includes(q))
      : _allBooks;

    if (!visible.length) {
      list.innerHTML = `<p class="placeholder-text">${q ? 'לא נמצאו ספרים' : 'אין ספרים במאגר — העלה קובץ PDF, Word או PowerPoint כדי להתחיל'}</p>`;
      return;
    }

    // Group by folder
    const groups = new Map();
    for (const b of visible) {
      const folder = b.folder || '';
      if (!groups.has(folder)) groups.set(folder, []);
      groups.get(folder).push(b);
    }

    const hint = '<p class="hint" style="margin-bottom:0.4rem">סמן ספרים לשימוש כהקשר ל-AI (ריק = כל הספרים)</p>';
    let html = hint;
    for (const [folder, books] of groups) {
      if (folder) {
        html += `<div class="book-folder-header">📁 ${escHtml(folder)}</div>`;
      }
      html += books.map(b => {
        const id = `book_${escHtml(b.folder ? b.folder + '/' + b.name : b.name)}`;
        const fullName = b.folder ? `${b.folder}/${b.name}` : b.name;
        return `
        <div class="book-item ${b.folder ? 'book-item--indented' : ''}">
          <input type="checkbox" class="book-item__select" data-book-name="${escHtml(b.name)}"
                 id="${escHtml(id)}" title="בחר ספר זה ל-AI" />
          <label for="${escHtml(id)}" class="book-item__icon" aria-hidden="true">${_bookIcon(b.name)}</label>
          <span class="book-item__name">${escHtml(b.displayName || b.name)}</span>
          <span class="book-item__size">${_fmtSize(b.size)}</span>
          <button class="btn btn--xs btn--ghost"
                  onclick="BooksManager.viewBook('${escHtml(fullName)}')"
                  title="הצג ספר">👁️ הצג</button>
          <button class="btn btn--xs btn--danger-ghost"
                  onclick="BooksManager.deleteBook('${escHtml(fullName)}')"
                  title="מחק ספר">🗑️</button>
        </div>`;
      }).join('');
    }
    list.innerHTML = html;
  }

  function _bookIcon(name) {
    const ext = name.split('.').pop().toLowerCase();
    if (ext === 'docx') return '📝';
    if (ext === 'pptx') return '📊';
    return '📕';
  }

  function _fmtSize(bytes) {
    if (bytes < 1024)        return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // ─── הצגת ספר ───────────────────────────────────────────────────────────────

  function viewBook(name) {
    const card   = document.getElementById('bookViewerCard');
    const frame  = document.getElementById('bookViewerFrame');
    const title  = document.getElementById('bookViewerTitle');
    const fallback = document.getElementById('bookViewerFallback');
    const dlLink = document.getElementById('bookViewerDownloadLink');
    const closeBtn = document.getElementById('bookViewerCloseBtn');

    const url = Api.getBookStreamUrl(name);
    const ext = name.split('.').pop().toLowerCase();

    title.textContent = name;
    card.classList.remove('hidden');
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });

    closeBtn.onclick = () => {
      card.classList.add('hidden');
      frame.src = 'about:blank';
    };

    if (ext === 'pdf') {
      frame.classList.remove('hidden');
      fallback.classList.add('hidden');
      frame.src = url;
    } else {
      // docx/pptx — cannot display inline; show download link
      frame.classList.add('hidden');
      fallback.classList.remove('hidden');
      dlLink.href = url;
      dlLink.download = name;
    }
  }

  // ─── מחיקה ──────────────────────────────────────────────────────────────────

  async function deleteBook(name) {
    const ok = await WindowManager.confirm(`האם למחוק את הספר "${name}" מהמאגר?`);
    if (!ok) return;
    try {
      await Api.deleteBook(name);
      await loadBooks();
    } catch (err) {
      alert(`שגיאה במחיקה: ${err.message}`);
    }
  }

  return { init, loadBooks, deleteBook, viewBook, getSelectedBooks };
})();
