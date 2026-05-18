// ─── מנהל מאגר ספרים (PDF) ───────────────────────────────────────────────────
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
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        alert('יש לגרור קובץ PDF בלבד');
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
        list.innerHTML = '<p class="placeholder-text">אין ספרים במאגר — העלה קובץ PDF כדי להתחיל</p>';
        return;
      }
      list.innerHTML = books.map(b => `
        <div class="book-item">
          <span class="book-item__icon" aria-hidden="true">📕</span>
          <span class="book-item__name">${escHtml(b.name)}</span>
          <span class="book-item__size">${_fmtSize(b.size)}</span>
          <button class="btn btn--xs btn--danger-ghost"
                  onclick="BooksManager.deleteBook('${escHtml(b.name)}')"
                  title="מחק ספר">🗑️</button>
        </div>`).join('');
    } catch (err) {
      list.innerHTML = `<p class="placeholder-text error-text">שגיאה בטעינה: ${escHtml(err.message)}</p>`;
    }
  }

  function _fmtSize(bytes) {
    if (bytes < 1024)        return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

  return { init, loadBooks, deleteBook };
})();
