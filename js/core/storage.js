(function () {
  const STORAGE_KEY = 'eduEstudos-state-v1';
  let sharedState = null;
  let loadError = false;
  let persistedState = null;

  function cloneState(state) {
    return JSON.parse(JSON.stringify(state));
  }

  function hasInvalidBoolean(source, keys) {
    return keys.some((key) => Object.prototype.hasOwnProperty.call(source, key)
      && typeof source[key] !== 'boolean');
  }

  function validateStoredState(parsed) {
    if (Object.prototype.hasOwnProperty.call(parsed, 'tasks')) {
      if (!Array.isArray(parsed.tasks)) {
        throw new Error('Task list invalid');
      }

      parsed.tasks.forEach((task) => {
        if (!task || typeof task !== 'object' || Array.isArray(task)
          || typeof task.title !== 'string' || !task.title.trim()
          || hasInvalidBoolean(task, ['completed', 'xpAwarded'])) {
          throw new Error('Task record invalid');
        }
      });
    }

    if (Object.prototype.hasOwnProperty.call(parsed, 'focus')) {
      const focus = parsed.focus;
      if (!focus || typeof focus !== 'object' || Array.isArray(focus)
        || hasInvalidBoolean(focus, ['taskCompletedAtStart', 'xpAwarded'])) {
        throw new Error('Focus state invalid');
      }
    }

    if (Object.prototype.hasOwnProperty.call(parsed, 'progress')) {
      const progress = parsed.progress;
      if (!progress || typeof progress !== 'object' || Array.isArray(progress)
        || ['totalXp', 'spentXp', 'level', 'totalFocusedMs'].some((key) =>
          Object.prototype.hasOwnProperty.call(progress, key)
          && (typeof progress[key] !== 'number' || !Number.isFinite(progress[key])))
        || (Object.prototype.hasOwnProperty.call(progress, 'inventory') && !Array.isArray(progress.inventory))) {
        throw new Error('Progress state invalid');
      }
    }

    if (Object.prototype.hasOwnProperty.call(parsed, 'missions')) {
      const missions = parsed.missions;
      if (!missions || typeof missions !== 'object' || Array.isArray(missions)) {
        throw new Error('Missions state invalid');
      }
      if (Object.prototype.hasOwnProperty.call(missions, 'progress')) {
        const progress = missions.progress;
        if (!progress || typeof progress !== 'object' || Array.isArray(progress)) {
          throw new Error('Mission progress invalid');
        }
        Object.values(progress).forEach((mission) => {
          if (mission !== undefined && (!mission || typeof mission !== 'object' || Array.isArray(mission))) {
            throw new Error('Mission record invalid');
          }
          if (mission && hasInvalidBoolean(mission, [
            'completed',
            'quizCorrect',
            'prioritySet',
            'choiceCorrect',
            'shortAnswerCorrect',
            'taskCompletedAtSelection',
            'progressReviewed',
          ])) {
            throw new Error('Mission flags invalid');
          }
        });
      }
    }

    if (Object.prototype.hasOwnProperty.call(parsed, 'privacyNoticeSeen')
      && typeof parsed.privacyNoticeSeen !== 'boolean') {
      throw new Error('Privacy notice flag invalid');
    }
  }

  function restoreSharedState() {
    if (!sharedState || !persistedState) {
      return;
    }
    Object.keys(sharedState).forEach((key) => delete sharedState[key]);
    Object.assign(sharedState, cloneState(persistedState));
  }

  function createDefaultProgressState() {
    return {
      totalXp: 0,
      spentXp: 0,
      level: 1,
      totalFocusedMs: 0,
      selectedItem: null,
      inventory: [],
    };
  }

  function createDefaultMissionsState() {
    return {
      activeMissionId: 'mission-1',
      progress: {
        'mission-1': { completed: false, quizCorrect: false, taskId: null },
        'mission-2': { completed: false, taskId: null, prioritySet: false },
        'mission-3': { completed: false, taskId: null, focusSessions: [] },
        'mission-4': { completed: false, choiceCorrect: false, shortAnswerCorrect: false },
        'mission-5': {
          completed: false,
          taskId: null,
          taskCompletedAtSelection: false,
          progressReviewed: false,
        },
      },
    };
  }

  function normalizeMissionsState(missionsState) {
    const defaults = createDefaultMissionsState();
    if (!missionsState || typeof missionsState !== 'object') {
      return defaults;
    }

    const sourceProgress = missionsState.progress && typeof missionsState.progress === 'object'
      ? missionsState.progress
      : {};
    const progress = createDefaultMissionsState().progress;

    Object.keys(progress).forEach((missionId) => {
      const source = sourceProgress[missionId];
      if (!source || typeof source !== 'object') {
        return;
      }

      progress[missionId].completed = source.completed === true;
      if (missionId === 'mission-1') {
        progress[missionId].quizCorrect = source.quizCorrect === true;
        progress[missionId].taskId = typeof source.taskId === 'string' ? source.taskId : null;
      } else if (missionId === 'mission-2') {
        progress[missionId].taskId = typeof source.taskId === 'string' ? source.taskId : null;
        progress[missionId].prioritySet = source.prioritySet === true;
      } else if (missionId === 'mission-3') {
        progress[missionId].taskId = typeof source.taskId === 'string' ? source.taskId : null;
        progress[missionId].focusSessions = Array.isArray(source.focusSessions)
          ? source.focusSessions
            .filter((session) => session && typeof session === 'object'
              && typeof session.sessionId === 'string' && typeof session.taskId === 'string'
              && session.taskId === progress[missionId].taskId)
            .slice(0, 100)
            .map((session) => ({
              sessionId: session.sessionId,
              taskId: session.taskId,
              totalFocusedMs: Number.isFinite(Number(session.totalFocusedMs))
                ? Math.max(0, Math.min(25 * 60 * 1000, Number(session.totalFocusedMs)))
                : 0,
            }))
          : [];
      } else if (missionId === 'mission-4') {
        progress[missionId].choiceCorrect = source.choiceCorrect === true;
        progress[missionId].shortAnswerCorrect = source.shortAnswerCorrect === true;
      } else if (missionId === 'mission-5') {
        progress[missionId].taskId = typeof source.taskId === 'string' ? source.taskId : null;
        progress[missionId].taskCompletedAtSelection = source.taskCompletedAtSelection === true;
        progress[missionId].progressReviewed = source.progressReviewed === true;
      }
    });

    const validMissionIds = Object.keys(progress);
    return {
      activeMissionId: validMissionIds.includes(missionsState.activeMissionId)
        ? missionsState.activeMissionId
        : defaults.activeMissionId,
      progress,
    };
  }

  function createDefaultState() {
    return {
      version: 1,
      tasks: [],
      focus: createDefaultFocusState(),
      progress: createDefaultProgressState(),
      missions: createDefaultMissionsState(),
      privacyNoticeSeen: false,
      lastUpdated: null,
    };
  }

  function createDefaultFocusState() {
    return {
      taskId: null,
      sessionId: null,
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

  function sanitizeText(value, fallback = '') {
    return typeof value === 'string' ? value.trim() : fallback;
  }

  function normalizePriority(value) {
    const normalized = sanitizeText(value).toLowerCase();
    if (['baixa', 'media', 'média', 'alta'].includes(normalized)) {
      return normalized === 'média' ? 'media' : normalized;
    }
    return 'media';
  }

  function normalizeCategory(value) {
    const normalized = sanitizeText(value).toLowerCase();
    const options = ['estudo', 'leitura', 'projeto'];
    return options.includes(normalized) ? normalized : 'estudo';
  }

  function normalizeFocusState(focusState) {
    const defaults = createDefaultFocusState();
    if (!focusState || typeof focusState !== 'object') {
      return defaults;
    }

    const durationValue = Number(focusState.durationMinutes || defaults.durationMinutes);
    const durationMinutes = Number.isFinite(durationValue) ? Math.min(25, Math.max(5, durationValue)) : defaults.durationMinutes;
    const durationMs = durationMinutes * 60 * 1000;
    const remainingValue = focusState.remainingMs === undefined || focusState.remainingMs === null
      ? durationMs
      : Number(focusState.remainingMs);
    const remainingMs = Number.isFinite(remainingValue)
      ? Math.min(durationMs, Math.max(0, remainingValue))
      : durationMs;
    const status = ['idle', 'running', 'paused', 'completed'].includes(focusState.status) ? focusState.status : 'idle';

    return {
      taskId: typeof focusState.taskId === 'string' ? focusState.taskId : null,
      sessionId: typeof focusState.sessionId === 'string' ? focusState.sessionId : null,
      durationMinutes,
      status,
      startedAt: typeof focusState.startedAt === 'string' ? focusState.startedAt : null,
      lastTickAt: typeof focusState.lastTickAt === 'string' ? focusState.lastTickAt : null,
      remainingMs,
      totalFocusedMs: Number.isFinite(Number(focusState.totalFocusedMs))
        ? Math.min(durationMs, Math.max(0, Number(focusState.totalFocusedMs)))
        : 0,
      completedAt: typeof focusState.completedAt === 'string' ? focusState.completedAt : null,
      taskCompletedAtStart: typeof focusState.taskCompletedAtStart === 'boolean'
        ? focusState.taskCompletedAtStart
        : status !== 'idle',
      xpAwarded: typeof focusState.xpAwarded === 'boolean'
        ? focusState.xpAwarded
        : status === 'completed',
    };
  }

  function normalizeProgressState(progressState) {
    const defaults = createDefaultProgressState();
    if (!progressState || typeof progressState !== 'object') {
      return defaults;
    }

    const rawTotalXp = Number(progressState.totalXp || 0);
    const totalXp = Number.isFinite(rawTotalXp) ? Math.max(0, Math.floor(rawTotalXp)) : 0;
    const rawSpentXp = Number(progressState.spentXp || 0);
    const spentXp = Number.isFinite(rawSpentXp) ? Math.min(totalXp, Math.max(0, Math.floor(rawSpentXp))) : 0;
    const rawTotalFocusedMs = Number(progressState.totalFocusedMs || 0);
    const totalFocusedMs = Number.isFinite(rawTotalFocusedMs) ? Math.max(0, Math.floor(rawTotalFocusedMs)) : 0;
    const inventory = Array.isArray(progressState.inventory) ? progressState.inventory : [];
    const normalizedInventory = [...new Set(inventory.filter((item) => typeof item === 'string' && item.trim()))].slice(0, 50);

    return {
      totalXp,
      spentXp,
      level: Math.floor(totalXp / 200) + 1,
      totalFocusedMs,
      selectedItem: typeof progressState.selectedItem === 'string' && normalizedInventory.includes(progressState.selectedItem)
        ? progressState.selectedItem
        : null,
      inventory: normalizedInventory,
    };
  }

  function cryptoRandomId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }

    return 'task-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function normalizeTask(task) {
    if (!task || typeof task !== 'object') {
      return null;
    }

    const title = sanitizeText(task.title, '').slice(0, 120);
    const details = sanitizeText(task.details, '').slice(0, 500);

    if (!title) {
      return null;
    }

    return {
      id: typeof task.id === 'string' && task.id ? task.id : cryptoRandomId(),
      title,
      details,
      category: normalizeCategory(task.category),
      priority: normalizePriority(task.priority),
      completed: task.completed === true,
      xpAwarded: task.xpAwarded === true,
      createdAt: typeof task.createdAt === 'string' ? task.createdAt : new Date().toISOString(),
      updatedAt: typeof task.updatedAt === 'string' ? task.updatedAt : new Date().toISOString(),
    };
  }

  function readStoredState() {
    const fallbackState = createDefaultState();
    loadError = false;

    try {
      const rawValue = localStorage.getItem(STORAGE_KEY);

      if (!rawValue) {
        persistedState = cloneState(fallbackState);
        return fallbackState;
      }

      const parsed = JSON.parse(rawValue);

      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('State invalid');
      }
      validateStoredState(parsed);

      const normalized = createDefaultState();
      const tasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];

      normalized.tasks = tasks
        .map((task) => normalizeTask(task))
        .filter(Boolean)
        .sort((left, right) => new Date(right.updatedAt || right.createdAt).getTime() - new Date(left.updatedAt || left.createdAt).getTime());

      normalized.focus = normalizeFocusState(parsed.focus);
      normalized.progress = normalizeProgressState(parsed.progress);
      normalized.missions = normalizeMissionsState(parsed.missions);
      normalized.privacyNoticeSeen = Boolean(parsed.privacyNoticeSeen);
      normalized.lastUpdated = typeof parsed.lastUpdated === 'string' ? parsed.lastUpdated : new Date().toISOString();
      normalized.version = 1;
      persistedState = cloneState(normalized);

      return normalized;
    } catch (error) {
      loadError = true;
      persistedState = null;
      console.warn('Dados de armazenamento inválidos. Iniciando com estado padrão.', error);
      return fallbackState;
    }
  }

  function getSharedState() {
    if (!sharedState) {
      sharedState = readStoredState();
    }

    return sharedState;
  }

  function saveStoredState(state) {
    if (loadError) {
      throw new Error('Os dados locais não puderam ser lidos. Confirme a reposição antes de guardar novos dados.');
    }

    const safeState = createDefaultState();

    safeState.version = 1;
    safeState.tasks = Array.isArray(state && state.tasks) ? state.tasks.map(normalizeTask).filter(Boolean) : [];
    safeState.focus = normalizeFocusState(state && state.focus);
    safeState.progress = normalizeProgressState(state && state.progress);
    safeState.missions = normalizeMissionsState(state && state.missions);
    safeState.privacyNoticeSeen = Boolean(state && state.privacyNoticeSeen === true);
    safeState.lastUpdated = new Date().toISOString();

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(safeState));
      if (state === sharedState) {
        Object.assign(sharedState, safeState);
      }
      persistedState = cloneState(safeState);
      return safeState;
    } catch (error) {
      console.error('Não foi possível guardar os dados do navegador.', error);
      if (state === sharedState) {
        restoreSharedState();
      }
      throw new Error('Não foi possível guardar os dados no navegador. Verifique o armazenamento e tente novamente.');
    }
  }

  function resetStoredState() {
    const resetState = createDefaultState();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(resetState));
      sharedState = resetState;
      persistedState = cloneState(resetState);
      loadError = false;
      return resetState;
    } catch (error) {
      console.error('Não foi possível repor os dados do navegador.', error);
      throw new Error('Não foi possível apagar os dados. Verifique o armazenamento do navegador e tente novamente.');
    }
  }

  const eduEstudosStorage = {
    STORAGE_KEY,
    createDefaultState,
    createDefaultFocusState,
    createDefaultMissionsState,
    createDefaultProgressState,
    getSharedState,
    hasLoadError: () => loadError,
    normalizeFocusState,
    normalizeMissionsState,
    normalizeProgressState,
    readStoredState,
    resetStoredState,
    saveStoredState,
  };

  if (typeof window !== 'undefined') {
    window.eduEstudos = window.eduEstudos || {};
    window.eduEstudos.storage = eduEstudosStorage;
  }

  if (typeof globalThis !== 'undefined') {
    globalThis.eduEstudosStorage = eduEstudosStorage;
  }
})();
