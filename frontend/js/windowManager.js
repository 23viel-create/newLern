// ניהול מעבר בין תצוגות וחלונות קופצים
const WindowManager = (() => {
  function showView(viewId) {
    document.querySelectorAll('.view').forEach((v) => {
      v.classList.remove('active');
      v.classList.add('hidden');
    });
    document.querySelectorAll('.nav-link').forEach((l) => l.classList.remove('active'));

    const target = document.getElementById(`view-${viewId}`);
    const link   = document.querySelector(`[data-view="${viewId}"]`);
    if (target) { target.classList.add('active'); target.classList.remove('hidden'); }
    if (link)   link.classList.add('active');
  }

  // מודל אישור — כפתור "ביטול" מקבל focus בכוונה למניעת מחיקה בטעות
  function confirm(message) {
    return new Promise((resolve) => {
      const modal      = document.getElementById('confirmModal');
      const msgEl      = document.getElementById('modalMessage');
      const cancelBtn  = document.getElementById('modalCancelBtn');
      const confirmBtn = document.getElementById('modalConfirmBtn');

      msgEl.textContent = message;
      modal.classList.remove('hidden');
      cancelBtn.focus(); // focus על "ביטול" — לא על "מחק"

      function cleanup(result) {
        modal.classList.add('hidden');
        confirmBtn.removeEventListener('click', onConfirm);
        cancelBtn.removeEventListener('click',  onCancel);
        modal.querySelector('.modal__overlay').removeEventListener('click', onCancel);
        resolve(result);
      }
      const onConfirm = () => cleanup(true);
      const onCancel  = () => cleanup(false);

      confirmBtn.addEventListener('click', onConfirm);
      cancelBtn.addEventListener('click',  onCancel);
      modal.querySelector('.modal__overlay').addEventListener('click', onCancel);
    });
  }

  // זיהוי מצב אופליין
  function initOfflineDetection() {
    const indicator = document.getElementById('offlineIndicator');
    const updateStatus = () => {
      indicator.classList.toggle('hidden', navigator.onLine);
    };
    window.addEventListener('online',  updateStatus);
    window.addEventListener('offline', updateStatus);
    updateStatus();
  }

  return { showView, confirm, initOfflineDetection };
})();
