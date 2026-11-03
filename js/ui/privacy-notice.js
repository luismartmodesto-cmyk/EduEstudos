(function () {
  const storage = typeof window !== 'undefined' && window.eduEstudos ? window.eduEstudos.storage : globalThis.eduEstudosStorage;

  if (!storage) {
    return;
  }

  let initialized = false;

  function getState() {
    return storage.getSharedState ? storage.getSharedState() : storage.readStoredState();
  }

  function openNotice() {
    if (storage.hasLoadError?.()) {
      return;
    }

    const dialog = document.getElementById('privacy-dialog');
    if (!dialog) {
      console.error('Aviso de privacidade indisponível: elemento da janela não encontrado.');
      return;
    }
    if (dialog.open) {
      return;
    }
    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function acceptNotice() {
    if (storage.hasLoadError?.()) {
      return;
    }

    const state = getState();
    state.privacyNoticeSeen = true;
    try {
      storage.saveStoredState(state);
    } catch (error) {
      console.error('Não foi possível guardar a confirmação do aviso de privacidade.', error);
      const feedback = document.getElementById('privacy-feedback');
      if (feedback) {
        feedback.textContent = 'Não foi possível salvar. Verifique o armazenamento e tente novamente.';
      }
      return;
    }
    const dialog = document.getElementById('privacy-dialog');
    if (dialog && typeof dialog.close === 'function' && dialog.open) {
      dialog.close();
    } else if (dialog) {
      dialog.removeAttribute('open');
    }
  }

  function openResetDialog() {
    const dialog = document.getElementById('reset-dialog');
    if (!dialog) {
      console.error('Reposição indisponível: elemento de confirmação não encontrado.');
      return;
    }
    if (dialog.open) {
      return;
    }

    const feedback = document.getElementById('reset-feedback');
    if (feedback) {
      feedback.textContent = '';
    }
    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function closeResetDialog() {
    const dialog = document.getElementById('reset-dialog');
    if (dialog && typeof dialog.close === 'function' && dialog.open) {
      dialog.close();
    } else if (dialog) {
      dialog.removeAttribute('open');
    }
  }

  function resetData() {
    try {
      storage.resetStoredState();
    } catch (error) {
      const feedback = document.getElementById('reset-feedback');
      if (feedback) {
        feedback.textContent = error instanceof Error
          ? error.message
          : 'Não foi possível apagar os dados. Tente novamente.';
      }
      return;
    }

    closeResetDialog();
    window.location.reload();
  }

  function init() {
    if (initialized) {
      return;
    }
    initialized = true;
    document.getElementById('privacy-notice-accept')?.addEventListener('click', acceptNotice);
    document.getElementById('privacy-notice-open')?.addEventListener('click', openNotice);
    document.getElementById('reset-data')?.addEventListener('click', openResetDialog);
    document.getElementById('storage-error-reset')?.addEventListener('click', openResetDialog);
    document.getElementById('reset-dialog-cancel')?.addEventListener('click', closeResetDialog);
    document.getElementById('reset-dialog-confirm')?.addEventListener('click', resetData);

    if (storage.hasLoadError?.()) {
      const errorNotice = document.getElementById('storage-error');
      if (errorNotice) {
        errorNotice.hidden = false;
      }
      return;
    }

    if (!getState().privacyNoticeSeen) {
      openNotice();
    }
  }

  if (typeof window !== 'undefined') {
    window.eduEstudos = window.eduEstudos || {};
    window.eduEstudos.privacyNotice = { init, openNotice, acceptNotice, openResetDialog, resetData };
  }
})();