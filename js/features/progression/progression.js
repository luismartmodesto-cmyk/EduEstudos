(function () {
  const storage = typeof window !== 'undefined' && window.eduEstudos ? window.eduEstudos.storage : globalThis.eduEstudosStorage;

  if (!storage) {
    return;
  }

  let initialized = false;

  function getState() {
    const snapshot = storage.getSharedState ? storage.getSharedState() : storage.readStoredState();
    if (!snapshot.progress || typeof snapshot.progress !== 'object') {
      snapshot.progress = storage.createDefaultProgressState();
    }

    snapshot.progress = storage.normalizeProgressState(snapshot.progress);
    return snapshot;
  }

  function calculateLevel(totalXp) {
    const safeTotalXp = Number.isFinite(Number(totalXp)) ? Math.max(0, Number(totalXp)) : 0;
    const level = Math.max(1, Math.floor(safeTotalXp / 200) + 1);
    const currentLevelXp = (level - 1) * 200;
    const xpToNextLevel = Math.max(0, level * 200 - safeTotalXp);
    const progress = Math.min(100, ((safeTotalXp - currentLevelXp) / 200) * 100);

    return {
      level,
      currentLevelXp,
      xpToNextLevel,
      progress,
      totalXp: safeTotalXp,
    };
  }

  function grantTaskXp(state, task) {
    if (!task || typeof task !== 'object' || !Boolean(task.completed) || task.xpAwarded) {
      return false;
    }

    state.progress = storage.normalizeProgressState(state.progress || storage.createDefaultProgressState());
    task.xpAwarded = true;
    state.progress.totalXp += 5;
    state.progress.level = calculateLevel(state.progress.totalXp).level;
    return true;
  }

  function awardTaskXp(task) {
    return grantTaskXp(getState(), task);
  }

  function awardFocusXp(focus, task) {
    if (!focus || focus.status !== 'completed' || focus.xpAwarded) {
      return 0;
    }

    const durationMinutes = Number.isFinite(Number(focus.durationMinutes))
      ? Math.max(0, Number(focus.durationMinutes))
      : 0;
    const focusedMinutes = Number.isFinite(Number(focus.totalFocusedMs))
      ? Math.max(0, Math.floor(Number(focus.totalFocusedMs) / 60000))
      : 0;
    const baseXp = Math.min(focusedMinutes, Math.floor(durationMinutes)) * 2;
    const bonusXp = !focus.taskCompletedAtStart && task && task.completed ? 10 : 0;
    const earnedXp = baseXp + bonusXp;

    focus.xpAwarded = true;
    const state = getState();
    state.progress.totalXp += earnedXp;
    state.progress.level = calculateLevel(state.progress.totalXp).level;
    renderProgress();
    if (window.eduEstudos?.shop?.render) {
      window.eduEstudos.shop.render();
    }
    return earnedXp;
  }

  function awardPendingTaskXp(state) {
    let changed = false;
    const tasks = Array.isArray(state.tasks) ? state.tasks : [];

    tasks.forEach((task) => {
      if (!task || typeof task !== 'object') {
        return;
      }

      changed = grantTaskXp(state, task) || changed;
    });

    if (changed) {
      state.progress.level = calculateLevel(state.progress.totalXp).level;
      try {
        storage.saveStoredState(state);
      } catch (error) {
        console.error('Não foi possível guardar a migração de XP das tarefas.', error);
        const feedback = document.getElementById('task-feedback');
        if (feedback) {
          feedback.textContent = 'Não foi possível salvar o progresso. Verifique o armazenamento e tente novamente.';
          feedback.dataset.tone = 'error';
        }
      }
    }
  }

  function renderProgress() {
    const state = getState();
    const progress = state.progress || storage.createDefaultProgressState();
    const summary = document.getElementById('progress-summary');
    const levelValue = document.getElementById('progress-level');
    const xpValue = document.getElementById('progress-xp-value');
    const xpNext = document.getElementById('progress-next-level');
    const bar = document.getElementById('progress-bar');
    const barFill = document.getElementById('progress-bar-fill');
    const tasksValue = document.getElementById('progress-complete-count');
    const availableValue = document.getElementById('progress-available-xp');

    if (!summary) {
      return;
    }

    const snapshot = calculateLevel(progress.totalXp);
    const availableXp = Math.max(0, progress.totalXp - (progress.spentXp || 0));
    const completedTasks = Array.isArray(state.tasks) ? state.tasks.filter((task) => task && task.completed).length : 0;

    if (levelValue) {
      levelValue.textContent = `Nível ${snapshot.level}`;
    }

    if (xpValue) {
      xpValue.textContent = `${progress.totalXp} XP`;
    }

    if (xpNext) {
      xpNext.textContent = snapshot.xpToNextLevel > 0 ? `${snapshot.xpToNextLevel} XP para o próximo nível` : 'Você chegou ao próximo nível!';
    }

    if (barFill) {
      barFill.style.width = `${snapshot.progress}%`;
    }

    if (tasksValue) {
      tasksValue.textContent = `${completedTasks}`;
    }

    if (availableValue) {
      availableValue.textContent = `${availableXp} XP`; 
    }

    const statusText = document.getElementById('progress-status');
    if (statusText) {
      statusText.textContent = snapshot.xpToNextLevel > 0
        ? `${snapshot.xpToNextLevel} XP faltam para avançar.`
        : 'Nível concluído e pronto para a próxima missão.';
    }
  }

  function init() {
    if (initialized) {
      return;
    }

    initialized = true;
    const state = getState();
    awardPendingTaskXp(state);
    renderProgress();
  }

  if (typeof window !== 'undefined') {
    window.eduEstudos = window.eduEstudos || {};
    window.eduEstudos.progression = {
      init,
      getState: () => getState(),
      calculateLevel,
      awardTaskXp,
      awardFocusXp,
      awardPendingTaskXp,
      render: renderProgress,
    };
  }

})();
