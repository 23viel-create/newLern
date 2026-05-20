// ─── מנהל גיבוי, ייצוא, ושחזור גרסאות ────────────────────────────────────────
const BackupManager = (() => {

  // ─── DOCX export ──────────────────────────────────────────────────────────
  async function exportDocx() {
    const node = typeof EditorManager !== 'undefined' ? EditorManager.getCurrentNode() : null;
    if (!node) { alert('פתח סיכום כדי לייצא'); return; }

    const html  = document.getElementById('editorContent')?.innerHTML || '';
    const title = node.title || node.path;

    try {
      const res = await fetch('/api/backup/docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodePath: node.path, title, html }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(`שגיאה בייצוא: ${err.error}`);
        return;
      }
      const blob = await res.blob();
      _triggerDownload(blob, `${title}.docx`,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    } catch (err) {
      alert(`שגיאה בייצוא Word: ${err.message}`);
    }
  }

  // ─── ZIP export ────────────────────────────────────────────────────────────
  async function exportZip(save = false) {
    try {
      const url  = Api.backupZipUrl('', save);
      const res  = await fetch(url);
      if (!res.ok) { alert('שגיאה בייצוא ZIP'); return; }
      const blob = await res.blob();
      const name = `backup_${new Date().toISOString().slice(0, 10)}.zip`;
      _triggerDownload(blob, name, 'application/zip');
      if (save) {
        await loadBackupList();
        alert('הגיבוי נשמר בהצלחה!');
      }
    } catch (err) {
      alert(`שגיאה: ${err.message}`);
    }
  }

  async function exportZipAndSave() {
    await exportZip(true);
  }

  // ─── ZIP import ────────────────────────────────────────────────────────────
  async function importZip() {
    const fileInput  = document.getElementById('importZipFile');
    const targetPath = document.getElementById('importTargetPath')?.value?.trim() || '';
    const msgEl      = document.getElementById('importZipMsg');

    if (!fileInput?.files?.length) { alert('בחר קובץ ZIP לייבוא'); return; }
    const file = fileInput.files[0];

    _setMsg(msgEl, 'מייבא...', 'info');
    try {
      const result = await Api.backupImport(file, targetPath);
      _setMsg(msgEl, `יובאו ${result.imported} קבצים בהצלחה ✓`, 'ok');
      fileInput.value = '';
      // Refresh the tree if available
      if (typeof SummariesManager !== 'undefined') SummariesManager.init();
    } catch (err) {
      _setMsg(msgEl, `שגיאה: ${err.message}`, 'err');
    }
  }

  function _setMsg(el, text, type) {
    if (!el) return;
    el.textContent = text;
    el.className = `save-status ${type === 'ok' ? 'save-status--saved' : type === 'err' ? 'save-status--error' : ''} `;
    el.classList.remove('hidden');
    if (type === 'ok') setTimeout(() => el.classList.add('hidden'), 4000);
  }

  // ─── Backup list ────────────────────────────────────────────────────────────
  async function loadBackupList() {
    const container = document.getElementById('backupsList');
    if (!container) return;
    try {
      const list = await Api.backupList();
      if (!list.length) {
        container.innerHTML = '<p class="placeholder-text">אין גיבויים שמורים עדיין</p>';
        return;
      }
      container.innerHTML = list.map(b => `
        <div class="backup-item">
          <span class="backup-item__name">${b.name}</span>
          <span class="backup-item__size">${(b.size / 1024).toFixed(1)} KB</span>
          <span class="backup-item__date">${new Date(b.createdAt).toLocaleDateString('he-IL')}</span>
        </div>
      `).join('');
    } catch {
      container.innerHTML = '<p class="placeholder-text">לא ניתן לטעון רשימת גיבויים</p>';
    }
  }

  // ─── Version history modal ─────────────────────────────────────────────────
  async function openHistory() {
    const node = typeof EditorManager !== 'undefined' ? EditorManager.getCurrentNode() : null;
    if (!node) { alert('פתח סיכום כדי לצפות בהיסטוריה'); return; }

    const modal   = document.getElementById('historyModal');
    const listEl  = document.getElementById('historyList');
    if (!modal || !listEl) return;

    listEl.innerHTML = '<p class="placeholder-text">טוען...</p>';
    modal.classList.remove('hidden');

    try {
      const versions = await Api.getHistory(node.path);
      if (!versions.length) {
        listEl.innerHTML = '<p class="placeholder-text">אין גרסאות שמורות לסיכום זה</p>';
        return;
      }
      listEl.innerHTML = versions.map(v => `
        <div class="history-item">
          <div class="history-item__meta">
            <strong>גרסה ${v.index + 1}</strong>
            <span class="history-item__date">${new Date(v.savedAt).toLocaleString('he-IL')}</span>
          </div>
          <div class="history-item__preview">${_escHtml(v.preview)}…</div>
          <button class="btn btn--ghost btn--xs restore-version-btn"
                  data-index="${v.index}"
                  data-path="${_escAttr(node.path)}">
            ↩ שחזר גרסה זו
          </button>
        </div>
      `).join('');

      listEl.querySelectorAll('.restore-version-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const idx  = parseInt(btn.dataset.index, 10);
          const ok   = await WindowManager.confirm(`שחזר גרסה ${idx + 1}? התוכן הנוכחי יישמר כגרסה חדשה.`);
          if (!ok) return;
          try {
            const content = await Api.restoreVersion(node.path, idx);
            // Update editor content
            const editor = document.getElementById('editorContent');
            if (editor) editor.innerHTML = content;
            modal.classList.add('hidden');
            alert('הגרסה שוחזרה בהצלחה ✓');
          } catch (err) {
            alert(`שגיאה בשחזור: ${err.message}`);
          }
        });
      });
    } catch (err) {
      listEl.innerHTML = `<p class="placeholder-text">שגיאה: ${err.message}</p>`;
    }
  }

  // ─── System diagnostics ───────────────────────────────────────────────────
  async function runDiagnostics() {
    const result = document.getElementById('diagnosticsResult');
    if (!result) return;
    result.classList.remove('hidden');
    result.innerHTML = '<p>מריץ בדיקות...</p>';

    const checks = [
      { label: 'שרת — health',          test: () => fetch('/api/health').then(r => r.ok) },
      { label: 'עץ סיכומים',            test: () => fetch('/api/summaries/tree').then(r => r.ok) },
      { label: 'לוח זמנים — הגדרות',    test: () => fetch('/api/schedule/settings').then(r => r.ok) },
      { label: 'שאלות — bundle',         test: () => fetch('/api/quizzes/bundle', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ paths: [] }) }).then(r => r.ok) },
      { label: 'גיבוי — רשימה',         test: () => fetch('/api/backup/list').then(r => r.ok) },
      { label: 'מצב AI — מפתחות',       test: () => fetch('/api/ai/key-status').then(r => r.ok) },
      { label: 'זיהוי אופליין',          test: () => Promise.resolve(typeof navigator !== 'undefined') },
    ];

    const rows = [];
    for (const check of checks) {
      let ok = false;
      try { ok = await check.test(); } catch { ok = false; }
      rows.push(`<div class="diag-row">
        <span class="diag-icon ${ok ? 'diag-icon--ok' : 'diag-icon--fail'}">${ok ? '✓' : '✕'}</span>
        <span class="diag-label">${check.label}</span>
        <span class="diag-status">${ok ? 'תקין' : 'שגיאה'}</span>
      </div>`);
    }
    result.innerHTML = rows.join('');
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────
  function _triggerDownload(blob, filename, mimeType) {
    const url  = URL.createObjectURL(new Blob([blob], { type: mimeType }));
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }

  function _escHtml(str) {
    return String(str || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function _escAttr(str) {
    return String(str || '').replace(/"/g, '&quot;');
  }

  // ─── Init ──────────────────────────────────────────────────────────────────
  function init() {
    document.getElementById('exportDocxBtn')    ?.addEventListener('click', exportDocx);
    document.getElementById('historyBtn')       ?.addEventListener('click', openHistory);
    document.getElementById('historyCloseBtn')  ?.addEventListener('click', () =>
      document.getElementById('historyModal')?.classList.add('hidden'));
    document.getElementById('exportZipBtn')     ?.addEventListener('click', () => exportZip(false));
    document.getElementById('exportZipSaveBtn') ?.addEventListener('click', exportZipAndSave);
    document.getElementById('importZipBtn')     ?.addEventListener('click', importZip);
    document.getElementById('refreshBackupsBtn')?.addEventListener('click', loadBackupList);
    document.getElementById('runDiagnosticsBtn')?.addEventListener('click', runDiagnostics);
    document.getElementById('wordImportBtn')      ?.addEventListener('click', bulkImportWord);
    document.getElementById('wordZipImportBtn')   ?.addEventListener('click', importWordZip);
    document.getElementById('exportWordZipBtn')   ?.addEventListener('click', exportWordZip);

    // Close history on overlay click
    document.getElementById('historyModal')?.querySelector('.modal__overlay')
      ?.addEventListener('click', () =>
        document.getElementById('historyModal')?.classList.add('hidden'));
  }

  // ─── Bulk Word folder import ──────────────────────────────────────────────
  async function bulkImportWord() {
    const input      = document.getElementById('wordFolderInput');
    const targetRoot = (document.getElementById('wordImportTarget')?.value || 'root').trim();
    const msgEl      = document.getElementById('wordImportMsg');
    const files      = Array.from(input?.files || []);
    if (!files.length) { _setMsg(msgEl, 'יש לבחור תיקייה תחילה', 'error'); return; }

    _setMsg(msgEl, `מייבא ${files.length} קבצים...`, 'ok');
    const fd = new FormData();
    files.forEach(f => {
      fd.append('files', f, f.name);
      fd.append('paths', f.webkitRelativePath || f.name);
    });
    fd.append('targetRoot', targetRoot);

    try {
      const res  = await fetch('/api/backup/import-word-bulk', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'שגיאת שרת');
      const r       = data.data;
      const errPart = r.errors?.length ? ` | ${r.errors.length} שגיאות` : '';
      _setMsg(msgEl, `✓ יובאו ${r.imported} סיכומים, דולגו ${r.skipped} קבצים${errPart}`, 'ok');
      if (typeof SummariesManager !== 'undefined') SummariesManager.init();
      if (input) input.value = '';
    } catch (err) {
      _setMsg(msgEl, `שגיאה: ${err.message}`, 'error');
    }
  }

  // ─── Import ZIP of Word files ─────────────────────────────────────────────
  async function importWordZip() {
    const input      = document.getElementById('wordZipInput');
    const targetRoot = (document.getElementById('wordImportTarget')?.value || 'root').trim();
    const msgEl      = document.getElementById('wordImportMsg');
    const file       = input?.files?.[0];
    if (!file) { _setMsg(msgEl, 'יש לבחור קובץ ZIP תחילה', 'error'); return; }

    _setMsg(msgEl, 'מייבא מתוך ZIP...', 'ok');
    const fd = new FormData();
    fd.append('files', file, file.name);
    fd.append('targetRoot', targetRoot);

    try {
      const res  = await fetch('/api/backup/import-word-bulk', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'שגיאת שרת');
      const r       = data.data;
      const errPart = r.errors?.length ? ` | ${r.errors.length} שגיאות` : '';
      _setMsg(msgEl, `✓ יובאו ${r.imported} סיכומים, דולגו ${r.skipped} קבצים${errPart}`, 'ok');
      if (typeof SummariesManager !== 'undefined') SummariesManager.init();
      if (input) input.value = '';
    } catch (err) {
      _setMsg(msgEl, `שגיאה: ${err.message}`, 'error');
    }
  }

  // ─── Export full tree as Word ZIP ─────────────────────────────────────────
  function exportWordZip() {
    const fname = `word_export_${new Date().toISOString().slice(0, 10)}.zip`;
    const a = document.createElement('a');
    a.href     = '/api/backup/export-word-zip';
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return { init, loadBackupList, exportDocx, exportZip, openHistory, runDiagnostics, bulkImportWord, importWordZip, exportWordZip };
})();
