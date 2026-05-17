// ניהול מעבר בין תצוגות, מודל אישור, ומודל קלט שם
const WindowManager = (() => {

  // ─── ניווט ────────────────────────────────────────────────────────────────

  function showView(viewId) {
    document.querySelectorAll('.view').forEach((v) => {
      v.classList.remove('active');
      v.classList.add('hidden');
    });
    document.querySelectorAll('.nav-link').forEach((l) => l.classList.remove('active'));

    const target = document.getElementById(`view-${viewId}`);
    const link   = document.querySelector(`[data-view="${viewId}"]`);
    if (target) { target.classList.remove('hidden'); target.classList.add('active'); }
    if (link)   link.classList.add('active');
  }

  // ─── מודל אישור מחיקה ─────────────────────────────────────────────────────
  // "ביטול" מקבל focus למניעת מחיקה בטעות על ידי Enter

  function confirm(message) {
    return new Promise((resolve) => {
      const modal      = document.getElementById('confirmModal');
      const msgEl      = document.getElementById('modalMessage');
      const cancelBtn  = document.getElementById('modalCancelBtn');
      const confirmBtn = document.getElementById('modalConfirmBtn');

      msgEl.textContent = message;
      modal.classList.remove('hidden');
      cancelBtn.focus();

      function cleanup(result) {
        modal.classList.add('hidden');
        confirmBtn.removeEventListener('click', onConfirm);
        cancelBtn.removeEventListener('click',  onCancel);
        document.removeEventListener('keydown', onKeydown);
        modal.querySelector('.modal__overlay').removeEventListener('click', onCancel);
        resolve(result);
      }
      const onConfirm = () => cleanup(true);
      const onCancel  = () => cleanup(false);
      const onKeydown = (e) => { if (e.key === 'Escape') onCancel(); };

      confirmBtn.addEventListener('click', onConfirm);
      cancelBtn.addEventListener('click',  onCancel);
      document.addEventListener('keydown', onKeydown);
      modal.querySelector('.modal__overlay').addEventListener('click', onCancel);
    });
  }

  // ─── מודל קלט שם ──────────────────────────────────────────────────────────

  function promptInput(title, placeholder = '', defaultValue = '') {
    return new Promise((resolve) => {
      const modal      = document.getElementById('inputModal');
      const titleEl    = document.getElementById('inputModalTitle');
      const field      = document.getElementById('inputModalField');
      const errorEl    = document.getElementById('inputModalError');
      const cancelBtn  = document.getElementById('inputModalCancelBtn');
      const confirmBtn = document.getElementById('inputModalConfirmBtn');

      titleEl.textContent   = title;
      field.placeholder     = placeholder;
      field.value           = defaultValue;
      errorEl.textContent   = '';
      errorEl.classList.add('hidden');

      modal.classList.remove('hidden');
      // Focus the input (not the confirm button) so user can type immediately
      setTimeout(() => { field.focus(); if (defaultValue) field.select(); }, 50);

      function cleanup(result) {
        modal.classList.add('hidden');
        confirmBtn.removeEventListener('click', onConfirm);
        cancelBtn.removeEventListener('click',  onCancel);
        field.removeEventListener('keydown', onKeydown);
        modal.querySelector('.modal__overlay').removeEventListener('click', onCancel);
        resolve(result);
      }

      const onConfirm = () => {
        const val = field.value.trim();
        if (!val) {
          errorEl.textContent = 'יש להזין שם';
          errorEl.classList.remove('hidden');
          field.focus();
          return;
        }
        cleanup(val);
      };
      const onCancel  = () => cleanup(null);
      const onKeydown = (e) => {
        if (e.key === 'Enter')  { e.preventDefault(); onConfirm(); }
        if (e.key === 'Escape') { e.preventDefault(); onCancel();  }
      };

      confirmBtn.addEventListener('click', onConfirm);
      cancelBtn.addEventListener('click',  onCancel);
      field.addEventListener('keydown', onKeydown);
      modal.querySelector('.modal__overlay').addEventListener('click', onCancel);
    });
  }

  // ─── זיהוי מצב אופליין ────────────────────────────────────────────────────

  let _offlineCallback = null;

  function initOfflineDetection(offlineCb) {
    if (offlineCb) _offlineCallback = offlineCb;
    const indicator = document.getElementById('offlineIndicator');
    const update    = () => {
      indicator.classList.toggle('hidden', navigator.onLine);
      if (_offlineCallback) _offlineCallback(!navigator.onLine);
    };
    window.addEventListener('online',  update);
    window.addEventListener('offline', update);
    update();
  }

  return { showView, confirm, promptInput, initOfflineDetection };
})();
