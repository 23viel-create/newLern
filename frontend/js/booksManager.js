// ─── מנהל מאגר ספרים (PDF / Word / PowerPoint) ──────────────────────────────
const BooksManager = (() => {
  let _bound = false;

  // ─── אתחול ──────────────────────────────────────────────────────────────────

  async function init() {
    if (!_bound) {
      _bindDropzone();
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

  async function loadBooks() {
    const list = document.getElementById('booksList');
    list.innerHTML = '<p class="placeholder-text">טוען...</p>';
    try {
      const books = await Api.getBooks();
      if (!books.length) {
        list.innerHTML = '<p class="placeholder-text">אין ספרים במאגר — העלה קובץ PDF, Word או PowerPoint כדי להתחיל</p>';
        return;
      }
      list.innerHTML = `
        <p class="hint" style="margin-bottom:0.4rem">סמן ספרים לשימוש כהקשר ל-AI (ריק = כל הספרים)</p>
        ${books.map(b => `
        <div class="book-item">
          <input type="checkbox" class="book-item__select" data-book-name="${escHtml(b.name)}"
                 id="book_${escHtml(b.name)}" title="בחר ספר זה ל-AI" />
          <label for="book_${escHtml(b.name)}" class="book-item__icon" aria-hidden="true">${_bookIcon(b.name)}</label>
          <span class="book-item__name">${escHtml(b.name)}</span>
          <span class="book-item__size">${_fmtSize(b.size)}</span>
          <button class="btn btn--xs btn--ghost"
                  onclick="BooksManager.viewBook('${escHtml(b.name)}')"
                  title="הצג ספר">👁️ הצג</button>
          <button class="btn btn--xs btn--danger-ghost"
                  onclick="BooksManager.deleteBook('${escHtml(b.name)}')"
                  title="מחק ספר">🗑️</button>
        </div>`).join('')}`;
    } catch (err) {
      list.innerHTML = `<p class="placeholder-text error-text">שגיאה בטעינה: ${escHtml(err.message)}</p>`;
    }
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
