(function () {
  const storage = typeof window !== 'undefined' && window.eduEstudos ? window.eduEstudos.storage : globalThis.eduEstudosStorage;

  if (!storage) {
    return;
  }

  const state = storage.getSharedState ? storage.getSharedState() : storage.readStoredState();
  let initialized = false;

  function getDefaultFocus() {
    return storage.createDefaultFocusState ? storage.createDefaultFocusState() : {
      taskId: null,
      durationMinutes: 15,
      status: 'idle',
      startedAt: null,
      lastTickAt: null,
      remainingMs: 15 * 60 * 1000,
      totalFocusedMs: 0,
      completedAt: null,
      taskCompletedAtStart: false,
      xpAwarded: false,
    };
  }

  function getDurationMs(minutes) {
    const value = Number(minutes || 15);
    return Math.min(25, Math.max(5, Number.isFinite(value) ? value : 15)) * 60 * 1000;
  }

  function createSessionId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'focus-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function notifyMissionProgress() {
    if (window.eduEstudos?.missions?.onFocusChanged) {
      window.eduEstudos.missions.onFocusChanged(state.focus);
    }
    if (window.eduEstudos?.parentSummary?.render) {
      window.eduEstudos.parentSummary.render();
    }
  }

  function formatTime(msValue) {
    const totalSeconds = Math.max(0, Math.ceil(msValue / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function getTaskOptions() {
    return Array.isArray(state.tasks) ? state.tasks : [];
  }

  function ensureFocusState() {
    if (!state.focus || typeof state.focus !== 'object') {
      state.focus = getDefaultFocus();
    }

    state.focus = storage.normalizeFocusState ? storage.normalizeFocusState(state.focus) : {
      ...getDefaultFocus(),
      ...state.focus,
      durationMinutes: Math.min(25, Math.max(5, Number(state.focus.durationMinutes || 15))),
      remainingMs: Number.isFinite(Number(state.focus.remainingMs))
        ? Math.max(0, Number(state.focus.remainingMs))
        : getDurationMs(state.focus.durationMinutes || 15),
    };
  }

  function setStatusText(message) {
    const banner = document.getElementById('focus-status');
    if (banner) {
      banner.textContent = message;
    }
  }

  function saveCurrentFocus() {
    state.focus = storage.normalizeFocusState ? storage.normalizeFocusState(state.focus) : state.focus;
    try {
      storage.saveStoredState(state);
    } catch (error) {
      console.error('Não foi possível guardar a sessão de foco.', error);
      render();
      setStatusText('Não foi possível salvar. Verifique o armazenamento e tente novamente.');
      window.eduEstudos?.progression?.render?.();
      window.eduEstudos?.shop?.render?.();
      return false;
    }
    render();
    notifyMissionProgress();
    return true;
  }

  function updateTaskDropdown() {
    const select = document.getElementById('focus-task');
    if (!select) return;

    const options = getTaskOptions();
    const currentTaskId = state.focus.taskId;
    select.innerHTML = '';

    if (!options.length) {
      const emptyOption = document.createElement('option');
      emptyOption.value = '';
      emptyOption.textContent = 'Crie uma tarefa antes de focar';
      select.appendChild(emptyOption);
      select.disabled = true;
      return;
    }

    select.disabled = false;
    options.forEach((task) => {
      const option = document.createElement('option');
      option.value = task.id;
      option.textContent = task.title;
      if (task.id === currentTaskId || (!currentTaskId && task.completed === false)) {
        option.selected = true;
        state.focus.taskId = task.id;
      }
      select.appendChild(option);
    });
  }

  function render() {
    ensureFocusState();
    const status = document.getElementById('focus-status');
    const timer = document.getElementById('focus-timer');
    const durationField = document.getElementById('focus-duration');
    const taskSelect = document.getElementById('focus-task');
    const startButton = document.getElementById('focus-start');
    const pauseButton = document.getElementById('focus-pause');
    const resumeButton = document.getElementById('focus-resume');
    const completeButton = document.getElementById('focus-complete');
    const summary = document.getElementById('focus-summary');

    if (durationField) {
      durationField.value = String(state.focus.durationMinutes || 15);
    }

    updateTaskDropdown();

    if (taskSelect && state.focus.taskId) {
      taskSelect.value = state.focus.taskId;
    }

    if (status) {
      const statusCopy = {
        idle: 'Pronto para começar',
        running: 'Em andamento',
        paused: 'Pausada',
        completed: 'Concluída',
      };
      status.textContent = statusCopy[state.focus.status] || 'Pronto para começar';
    }

    const displayedMs = Number.isFinite(Number(state.focus.remainingMs))
      ? Math.max(0, Number(state.focus.remainingMs))
      : getDurationMs(state.focus.durationMinutes);
    if (timer) {
      timer.textContent = formatTime(displayedMs);
    }

    if (summary) {
      const task = getTaskOptions().find((item) => item.id === state.focus.taskId);
      if (state.focus.status === 'completed') {
        summary.textContent = task ? `Sessão concluída para “${task.title}”.` : 'Sessão concluída.';
      } else if (state.focus.status === 'running') {
        summary.textContent = task ? `Foco em andamento para “${task.title}”.` : 'Foco em andamento.';
      } else if (state.focus.status === 'paused') {
        summary.textContent = task ? `Sessão pausada em “${task.title}”.` : 'Sessão pausada.';
      } else {
        summary.textContent = 'Escolha uma tarefa e inicie a sessão.';
      }
    }

    const isRunning = state.focus.status === 'running';
    const isPaused = state.focus.status === 'paused';
    const hasTask = Boolean(getTaskOptions().length);
    const canStart = !isRunning && !isPaused && hasTask && state.focus.status !== 'completed';

    if (durationField) durationField.disabled = state.focus.status !== 'idle';
    if (taskSelect) taskSelect.disabled = state.focus.status !== 'idle' || !hasTask;
    if (startButton) startButton.disabled = !canStart;
    if (pauseButton) pauseButton.disabled = !isRunning;
    if (resumeButton) resumeButton.disabled = !isPaused;
    if (completeButton) completeButton.disabled = !isRunning && !isPaused;
  }

  function applyElapsedTime() {
    const focus = state.focus;
    if (!focus || focus.status !== 'running' || !focus.lastTickAt) {
      return;
    }

    const now = Date.now();
    const lastTick = new Date(focus.lastTickAt).getTime();
    if (!Number.isFinite(lastTick)) {
      return;
    }

    const elapsedMs = now - lastTick;
    if (elapsedMs <= 0) {
      return;
    }

    const remainingMs = Number.isFinite(Number(focus.remainingMs))
      ? Math.max(0, Number(focus.remainingMs))
      : getDurationMs(focus.durationMinutes);
    const countedMs = Math.min(remainingMs, elapsedMs);
    focus.remainingMs = Math.max(0, remainingMs - countedMs);
    state.progress = storage.normalizeProgressState(state.progress || storage.createDefaultProgressState());
    state.progress.totalFocusedMs += Math.floor(countedMs);
    focus.totalFocusedMs = Math.min(
      getDurationMs(focus.durationMinutes),
      Math.max(0, getDurationMs(focus.durationMinutes) - focus.remainingMs),
    );
    focus.lastTickAt = new Date(now).toISOString();

    if (focus.remainingMs <= 0) {
      focus.status = 'completed';
      focus.completedAt = new Date(now).toISOString();
      focus.totalFocusedMs = getDurationMs(focus.durationMinutes);
      focus.remainingMs = 0;
      focus.lastTickAt = null;
      focus.startedAt = null;
    }
  }

  function awardCompletedFocusXp() {
    const focus = state.focus;
    if (!focus || focus.status !== 'completed' || focus.xpAwarded) {
      return;
    }

    const progression = window.eduEstudos && window.eduEstudos.progression;
    if (!progression || typeof progression.awardFocusXp !== 'function') {
      console.error('Não foi possível registrar o XP da sessão de foco: módulo de progressão indisponível.');
      setStatusText('Não foi possível registrar o progresso da sessão.');
      return;
    }

    const task = getTaskOptions().find((item) => item.id === focus.taskId);
    progression.awardFocusXp(focus, task);
  }

  function startFocusSession() {
    ensureFocusState();
    const tasks = getTaskOptions();
    const taskSelect = document.getElementById('focus-task');
    const durationField = document.getElementById('focus-duration');

    if (!tasks.length) {
      setStatusText('Crie uma tarefa antes de iniciar o foco.');
      return;
    }

    const taskId = taskSelect ? taskSelect.value : state.focus.taskId;
    const durationMinutes = Number(durationField ? durationField.value : state.focus.durationMinutes);

    if (!taskId || !tasks.some((task) => task.id === taskId)) {
      setStatusText('Selecione uma tarefa válida para focar.');
      return;
    }

    state.focus = {
      ...state.focus,
      taskId,
      sessionId: createSessionId(),
      durationMinutes: Math.min(25, Math.max(5, Number.isFinite(durationMinutes) ? durationMinutes : 15)),
      status: 'running',
      startedAt: new Date().toISOString(),
      lastTickAt: new Date().toISOString(),
      remainingMs: getDurationMs(Math.min(25, Math.max(5, Number.isFinite(durationMinutes) ? durationMinutes : 15))),
      totalFocusedMs: 0,
      completedAt: null,
      taskCompletedAtStart: Boolean(tasks.find((task) => task.id === taskId).completed),
      xpAwarded: false,
    };

    saveCurrentFocus();
  }

  function pauseFocusSession() {
    ensureFocusState();
    if (state.focus.status !== 'running' || !state.focus.lastTickAt) {
      return;
    }

    applyElapsedTime();
    if (state.focus.status !== 'running') {
      awardCompletedFocusXp();
      saveCurrentFocus();
      return;
    }

    state.focus.status = 'paused';
    state.focus.startedAt = null;
    state.focus.lastTickAt = null;
    state.focus.completedAt = null;
    saveCurrentFocus();
  }

  function resumeFocusSession() {
    ensureFocusState();
    if (state.focus.status !== 'paused') {
      return;
    }

    state.focus.status = 'running';
    state.focus.startedAt = new Date().toISOString();
    state.focus.lastTickAt = new Date().toISOString();
    state.focus.completedAt = null;
    saveCurrentFocus();
  }

  function completeFocusSession() {
    ensureFocusState();
    if (state.focus.status === 'completed' || !['running', 'paused'].includes(state.focus.status)) {
      return;
    }

    applyElapsedTime();
    if (state.focus.status !== 'completed') {
      state.focus.status = 'completed';
      state.focus.completedAt = new Date().toISOString();
      state.focus.startedAt = null;
      state.focus.lastTickAt = null;
      state.focus.remainingMs = 0;
    }
    awardCompletedFocusXp();
    saveCurrentFocus();
  }

  function resetFocusSession() {
    state.focus = getDefaultFocus();
    saveCurrentFocus();
  }

  function bindEvents() {
    const startButton = document.getElementById('focus-start');
    const pauseButton = document.getElementById('focus-pause');
    const resumeButton = document.getElementById('focus-resume');
    const completeButton = document.getElementById('focus-complete');
    const resetButton = document.getElementById('focus-reset');
    const taskSelect = document.getElementById('focus-task');
    const durationField = document.getElementById('focus-duration');

    startButton?.addEventListener('click', startFocusSession);
    pauseButton?.addEventListener('click', pauseFocusSession);
    resumeButton?.addEventListener('click', resumeFocusSession);
    completeButton?.addEventListener('click', completeFocusSession);
    resetButton?.addEventListener('click', resetFocusSession);
    taskSelect?.addEventListener('change', () => {
      if (state.focus.status !== 'idle') {
        render();
        return;
      }
      state.focus.taskId = taskSelect.value || null;
      saveCurrentFocus();
    });
    durationField?.addEventListener('change', () => {
      if (state.focus.status !== 'idle') {
        render();
        return;
      }
      const value = Number(durationField.value || 15);
      state.focus.durationMinutes = Math.min(25, Math.max(5, Number.isFinite(value) ? value : 15));
      if (state.focus.status !== 'running') {
        state.focus.remainingMs = getDurationMs(state.focus.durationMinutes);
      }
      saveCurrentFocus();
    });
  }

  function tick() {
    ensureFocusState();
    applyElapsedTime();
    awardCompletedFocusXp();
    saveCurrentFocus();
  }

  function init() {
    if (initialized) {
      return;
    }

    ensureFocusState();
    if (['running', 'paused'].includes(state.focus.status) && !state.focus.sessionId) {
      state.focus.sessionId = createSessionId();
      saveCurrentFocus();
    }
    bindEvents();
    render();
    initialized = true;
    notifyMissionProgress();

    if (typeof window !== 'undefined') {
      window.clearInterval(window.__eduFocusTimer);
      window.__eduFocusTimer = window.setInterval(tick, 1000);
    }
  }

  function refreshTasks() {
    ensureFocusState();
    render();
  }

  if (typeof window !== 'undefined') {
    window.eduEstudos = window.eduEstudos || {};
    window.eduEstudos.focus = {
      init,
      startFocusSession,
      pauseFocusSession,
      resumeFocusSession,
      completeFocusSession,
      resetFocusSession,
      refreshTasks,
      getState: () => ({ ...state.focus }),
    };
  }
})();
