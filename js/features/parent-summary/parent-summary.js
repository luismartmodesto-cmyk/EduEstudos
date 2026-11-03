(function () {
  const storage = typeof window !== 'undefined' && window.eduEstudos ? window.eduEstudos.storage : globalThis.eduEstudosStorage;

  if (!storage) {
    return;
  }

  let initialized = false;

  function getSummary() {
    const state = storage.getSharedState ? storage.getSharedState() : storage.readStoredState();
    const progress = storage.normalizeProgressState(state.progress);
    const missions = storage.normalizeMissionsState(state.missions);
    const missionCount = Object.values(missions.progress).filter((mission) => mission.completed).length;
    const taskCount = Array.isArray(state.tasks) ? state.tasks.filter((task) => task && task.completed).length : 0;

    return {
      completedMissions: missionCount,
      completedTasks: taskCount,
      totalFocusedMs: progress.totalFocusedMs,
      totalXp: progress.totalXp,
      level: progress.level,
    };
  }

  function formatFocusTime(totalFocusedMs) {
    const totalMinutes = Math.floor(Math.max(0, totalFocusedMs) / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0) {
      return `${hours} h ${minutes} min`;
    }
    return `${totalMinutes} min`;
  }

  function render() {
    const summary = getSummary();
    const missionsValue = document.getElementById('summary-missions');
    const tasksValue = document.getElementById('summary-tasks');
    const focusValue = document.getElementById('summary-focus');
    const levelValue = document.getElementById('summary-level');

    if (missionsValue) missionsValue.textContent = String(summary.completedMissions);
    if (tasksValue) tasksValue.textContent = String(summary.completedTasks);
    if (focusValue) focusValue.textContent = formatFocusTime(summary.totalFocusedMs);
    if (levelValue) levelValue.textContent = `Nível ${summary.level} · ${summary.totalXp} XP`;

    return summary;
  }

  function init() {
    if (initialized) {
      return;
    }
    initialized = true;
    render();
  }

  if (typeof window !== 'undefined') {
    window.eduEstudos = window.eduEstudos || {};
    window.eduEstudos.parentSummary = { init, render, getSummary, formatFocusTime };
  }
})();