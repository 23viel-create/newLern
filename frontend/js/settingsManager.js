const SettingsManager = (() => {
  const RESET_META = {
    notes: {
      title: '🗑️ מחיקת כל הפתקיות',
      desc:  'פעולה זו תמחק לצמיתות את כל הפתקיות השמורות במערכת.',
      call:  () => Api.resetNotes(),
    },
    schedule: {
      title: '🗑️ מחיקת לוח הזמנים ומסלולי למידה',
      desc:  'פעולה זו תמחק לצמיתות את כל המשימות, החזרות המרווחות ומסלולי הלמידה.',
      call:  () => Api.resetSchedule(),
    },
    summaries: {
      title: '🗑️ מחיקת כל הסיכומים',
      desc:  'פעולה זו תמחק לצמיתות את כל עץ הסיכומים, השאלות, ההקלטות והגרסאות.',
      call:  () => Api.resetSummaries(),
    },
    all: {
      title: '💥 איפוס מלא — מחיקת כל הנתונים',
      desc:  'פעולה זו תמחק לצמיתות את כל הנתונים במערכת: סיכומים, לוח זמנים, פתקיות, ספרים, מאמרים וגיבויים. המערכת תחזור למצב התקנה חדשה.',
      call:  () => Api.resetAll(),
    },
  };

  let _pendingType = null;

  function openResetModal(type) {
    const meta = RESET_META[type];
    if (!meta) return;
    _pendingType = type;

    document.getElementById('dataResetModalTitle').textContent = meta.title;
    document.getElementById('dataResetModalDesc').textContent  = meta.desc;
    document.getElementById('dataResetSpinner').classList.add('hidden');
    document.getElementById('dataResetConfirmBtn').disabled = false;
    document.getElementById('dataResetCancelBtn').disabled  = false;
    document.getElementById('dataResetModal').classList.remove('hidden');
  }

  function closeResetModal() {
    document.getElementById('dataResetModal').classList.add('hidden');
    _pendingType = null;
  }

  async function confirmReset() {
    if (!_pendingType) return;
    const meta = RESET_META[_pendingType];
    if (!meta) return;

    const spinner    = document.getElementById('dataResetSpinner');
    const confirmBtn = document.getElementById('dataResetConfirmBtn');
    const cancelBtn  = document.getElementById('dataResetCancelBtn');

    spinner.classList.remove('hidden');
    confirmBtn.disabled = true;
    cancelBtn.disabled  = true;

    try {
      await meta.call();
      closeResetModal();
      _showToast('הנתונים נמחקו בהצלחה ✓', 'success');
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      spinner.classList.add('hidden');
      confirmBtn.disabled = false;
      cancelBtn.disabled  = false;
      _showToast('שגיאה במחיקה: ' + err.message, 'error');
    }
  }

  function _showToast(msg, type) {
    const existing = document.getElementById('dataResetToast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'dataResetToast';
    toast.className = `reset-toast reset-toast--${type}`;
    toast.textContent = msg;
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('reset-toast--visible'), 10);
    setTimeout(() => {
      toast.classList.remove('reset-toast--visible');
      setTimeout(() => toast.remove(), 400);
    }, 3000);
  }

  return { openResetModal, closeResetModal, confirmReset };
})();
