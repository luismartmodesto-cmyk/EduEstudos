(function () {
  if (typeof document === 'undefined') {
    return;
  }

  function start() {
    const storage = window.eduEstudos?.storage;
    if (storage?.getSharedState) {
      storage.getSharedState();
    }

    if (storage?.hasLoadError?.()) {
      window.eduEstudos?.privacyNotice?.init();
      return;
    }

    if (window.eduEstudos && typeof window.eduEstudos.tasks?.init === 'function') {
      window.eduEstudos.tasks.init();
    }

    if (window.eduEstudos && typeof window.eduEstudos.focus?.init === 'function') {
      window.eduEstudos.focus.init();
    }

    if (window.eduEstudos && typeof window.eduEstudos.progression?.init === 'function') {
      window.eduEstudos.progression.init();
    }

    if (window.eduEstudos && typeof window.eduEstudos.shop?.init === 'function') {
      window.eduEstudos.shop.init();
    }

    if (window.eduEstudos && typeof window.eduEstudos.missions?.init === 'function') {
      window.eduEstudos.missions.init();
    }

    if (window.eduEstudos && typeof window.eduEstudos.parentSummary?.init === 'function') {
      window.eduEstudos.parentSummary.init();
    }

    if (window.eduEstudos && typeof window.eduEstudos.privacyNotice?.init === 'function') {
      window.eduEstudos.privacyNotice.init();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
