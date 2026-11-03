(function () {
  const storage = typeof window !== 'undefined' && window.eduEstudos ? window.eduEstudos.storage : globalThis.eduEstudosStorage;

  if (!storage || !window.eduEstudos?.missionConfig) {
    return;
  }

  const missions = window.eduEstudos.missionConfig.missions;
  let initialized = false;

  function getState() {
    const state = storage.getSharedState ? storage.getSharedState() : storage.readStoredState();
    state.missions = storage.normalizeMissionsState(state.missions);
    return state;
  }

  function getMissionProgress(state, missionId) {
    return state.missions.progress[missionId];
  }

  function getTask(state, taskId) {
    return Array.isArray(state.tasks) ? state.tasks.find((task) => task && task.id === taskId) : null;
  }

  function getUnlockedThrough(state) {
    let unlockedThrough = 0;
    for (let index = 0; index < missions.length; index += 1) {
      if (index > 0 && !getMissionProgress(state, missions[index - 1].id).completed) {
        break;
      }
      unlockedThrough = index;
      if (!getMissionProgress(state, missions[index].id).completed) {
        break;
      }
    }
    return unlockedThrough;
  }

  function isMissionUnlocked(state, missionId) {
    const index = missions.findIndex((mission) => mission.id === missionId);
    if (index < 0) {
      return false;
    }
    return index <= getUnlockedThrough(state);
  }

  function setFeedback(message, tone = 'info') {
    const feedback = document.getElementById('mission-feedback');
    if (feedback) {
      feedback.textContent = message;
      feedback.dataset.tone = tone;
    }
  }

  function saveState(state) {
    try {
      const saved = storage.saveStoredState(state);
      Object.assign(state, saved);
    } catch (error) {
      console.error('Não foi possível guardar o progresso das missões.', error);
      setFeedback('Não foi possível salvar. Verifique o armazenamento e tente novamente.', 'error');
      render();
      return false;
    }
    if (window.eduEstudos?.parentSummary?.render) {
      window.eduEstudos.parentSummary.render();
    }
    return true;
  }

  function createElement(tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) {
      element.className = className;
    }
    if (text !== undefined) {
      element.textContent = text;
    }
    return element;
  }

  function makeTaskSelect(state, id, selectedTaskId) {
    const select = createElement('select');
    select.id = id;
    select.name = 'taskId';
    select.required = true;
    select.setAttribute('aria-label', 'Selecionar tarefa');
    const placeholder = createElement('option', '', state.tasks.length ? 'Selecione uma tarefa' : 'Crie uma tarefa primeiro');
    placeholder.value = '';
    placeholder.disabled = state.tasks.length > 0;
    select.appendChild(placeholder);

    state.tasks.forEach((task) => {
      const option = createElement('option', '', task.title);
      option.value = task.id;
      option.selected = task.id === selectedTaskId;
      select.appendChild(option);
    });

    return select;
  }

  function makeTaskField(state, id, selectedTaskId) {
    const field = createElement('label', 'field');
    field.appendChild(createElement('span', '', 'Tarefa pessoal'));
    field.appendChild(makeTaskSelect(state, id, selectedTaskId));
    if (!state.tasks.length) {
      const link = createElement('a', 'text-link', 'Criar uma tarefa');
      link.href = '#tarefas';
      field.appendChild(link);
    }
    return field;
  }

  function makeRadioFieldset(mission, selectedValue) {
    const fieldset = createElement('fieldset', 'mission-question');
    fieldset.appendChild(createElement('legend', '', mission.question));
    mission.options.forEach((choice, index) => {
      const label = createElement('label', 'mission-answer');
      const input = createElement('input');
      input.type = 'radio';
      input.name = 'answer';
      input.value = choice.value;
      input.required = true;
      input.checked = choice.value === selectedValue;
      label.appendChild(input);
      label.appendChild(createElement('span', '', choice.label));
      fieldset.appendChild(label);
    });
    return fieldset;
  }

  function renderMissionCards(state) {
    const list = document.getElementById('mission-list');
    if (!list) {
      return;
    }

    const unlockedThrough = getUnlockedThrough(state);
    const activeId = state.missions.activeMissionId;
    const nextMission = missions.find((mission) => !getMissionProgress(state, mission.id).completed);
    list.replaceChildren();

    missions.forEach((mission, index) => {
      const progress = getMissionProgress(state, mission.id);
      const unlocked = index <= unlockedThrough;
      const current = nextMission && mission.id === nextMission.id;
      const selected = mission.id === activeId && unlocked;
      const status = progress.completed ? 'Concluída' : current ? 'Missão atual' : unlocked ? 'Disponível' : 'Bloqueada';
      const item = createElement('li', `mission-card${current ? ' mission-card--current' : ''}${unlocked ? '' : ' mission-card--locked'}`);
      item.setAttribute('aria-label', `Missão ${index + 1}, ${status.toLowerCase()}`);

      item.appendChild(createElement('span', 'mission-card__number', String(index + 1).padStart(2, '0')));
      const content = createElement('div', 'mission-card__content');
      const statusLabel = createElement('span', `status-label${current ? ' status-label--current' : ''}`, status);
      content.appendChild(statusLabel);
      content.appendChild(createElement('h3', '', mission.title));
      content.appendChild(createElement('p', '', mission.description));

      if (unlocked) {
        const action = createElement('button', 'text-link mission-card__action', progress.completed ? 'Rever missão' : current ? 'Continuar missão' : 'Abrir missão');
        action.type = 'button';
        action.dataset.missionId = mission.id;
        if (selected) {
          action.setAttribute('aria-current', 'step');
        }
        content.appendChild(action);
      }

      item.appendChild(content);
      item.appendChild(createElement('span', 'mission-card__symbol', mission.symbol));
      list.appendChild(item);
    });
  }

  function renderChecklist(container, criteria, complete) {
    const list = createElement('ul', 'mission-checklist');
    const item = createElement('li', complete ? 'mission-checklist__item mission-checklist__item--complete' : 'mission-checklist__item');
    item.appendChild(createElement('span', '', complete ? '✓' : '○'));
    item.appendChild(createElement('span', '', criteria));
    list.appendChild(item);
    container.appendChild(list);
  }

  function renderDetail(state) {
    const detail = document.getElementById('mission-detail');
    const title = document.getElementById('mission-title');
    const status = document.getElementById('mission-current-status');
    if (!detail || !title || !status) {
      return;
    }

    const mission = missions.find((entry) => entry.id === state.missions.activeMissionId) || missions[0];
    const progress = getMissionProgress(state, mission.id);
    const unlocked = isMissionUnlocked(state, mission.id);
    detail.replaceChildren();
    title.textContent = `Missão ${missions.indexOf(mission) + 1}: ${mission.title}`;
    status.textContent = progress.completed ? 'Concluída' : unlocked ? 'Disponível' : 'Bloqueada';
    status.className = progress.completed || unlocked ? 'status-label status-label--current' : 'status-label';
    detail.appendChild(createElement('p', '', mission.description));
    renderMissionActivity(state, mission, progress, detail);
  }

  function renderMissionActivity(state, mission, progress, container) {
    const form = createElement('form', 'mission-activity');
    form.noValidate = true;
    const feedback = document.getElementById('mission-feedback');

    if (mission.id === 'mission-1') {
      form.appendChild(makeRadioFieldset(mission, progress.quizCorrect ? mission.answer : ''));
      form.appendChild(makeTaskField(state, 'mission-task-select', progress.taskId));
      const submit = createElement('button', 'action-button action-button--primary', 'Verificar e continuar');
      submit.type = 'submit';
      form.appendChild(submit);
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const answer = form.querySelector('input[name="answer"]:checked');
        submitMission1(answer ? answer.value : '', form.querySelector('[name="taskId"]').value);
      });
    } else if (mission.id === 'mission-2') {
      form.appendChild(makeTaskField(state, 'mission-task-select', progress.taskId));
      const priorityField = createElement('label', 'field');
      priorityField.appendChild(createElement('span', '', 'Prioridade'));
      const prioritySelect = createElement('select');
      prioritySelect.name = 'priority';
      prioritySelect.required = true;
      const priorities = [
        { value: 'baixa', label: 'Baixa' },
        { value: 'media', label: 'Média' },
        { value: 'alta', label: 'Alta' },
      ];
      const selectedTask = getTask(state, progress.taskId);
      priorities.forEach((priority) => {
        const option = createElement('option', '', priority.label);
        option.value = priority.value;
        option.selected = priority.value === (selectedTask ? selectedTask.priority : 'media');
        prioritySelect.appendChild(option);
      });
      priorityField.appendChild(prioritySelect);
      form.appendChild(priorityField);
      const submit = createElement('button', 'action-button action-button--primary', 'Salvar prioridade');
      submit.type = 'submit';
      form.appendChild(submit);
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        setMission2Priority(form.querySelector('[name="taskId"]').value, prioritySelect.value);
      });
    } else if (mission.id === 'mission-3') {
      const focusProgress = progress.focusSessions.reduce((total, session) => total + session.totalFocusedMs, 0);
      const minutes = Math.min(3, Math.floor(focusProgress / 60000));
      const selectedTask = getTask(state, progress.taskId);
      container.appendChild(createElement('p', '', `Foco válido registrado: ${minutes} de 3 minutos.`));
      container.appendChild(createElement('p', '', progress.taskId
        ? `Tarefa principal: ${selectedTask ? selectedTask.title : 'tarefa removida'}.`
        : 'Selecione uma tarefa principal na área de foco.'));
      const focusLink = createElement('a', 'action-link', 'Ir para o foco');
      focusLink.href = '#foco';
      container.appendChild(focusLink);
      renderChecklist(container, mission.criteria, progress.completed);
      return;
    } else if (mission.id === 'mission-4') {
      form.appendChild(makeRadioFieldset(mission, progress.choiceCorrect ? mission.answer : ''));
      const answerField = createElement('label', 'field');
      answerField.appendChild(createElement('span', '', 'Resposta curta'));
      const shortAnswer = createElement('input');
      shortAnswer.type = 'text';
      shortAnswer.name = 'shortAnswer';
      shortAnswer.maxLength = 100;
      shortAnswer.required = true;
      answerField.appendChild(shortAnswer);
      form.appendChild(answerField);
      const submit = createElement('button', 'action-button action-button--primary', 'Verificar resposta');
      submit.type = 'submit';
      form.appendChild(submit);
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const answer = form.querySelector('input[name="answer"]:checked');
        submitMission4(answer ? answer.value : '', shortAnswer.value);
      });
    } else if (mission.id === 'mission-5') {
      form.appendChild(makeTaskField(state, 'mission-task-select', progress.taskId));
      const submit = createElement('button', 'action-button action-button--primary', 'Selecionar tarefa');
      submit.type = 'submit';
      form.appendChild(submit);
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        selectMission5Task(form.querySelector('[name="taskId"]').value);
      });
      const reviewLink = createElement('a', 'action-link', progress.progressReviewed ? 'Progresso consultado' : 'Rever meu progresso');
      reviewLink.href = '#progresso';
      reviewLink.dataset.reviewProgress = 'true';
      container.appendChild(reviewLink);
      reviewLink.addEventListener('click', (event) => {
        event.preventDefault();
        reviewProgress();
        window.location.hash = 'progresso';
      });
    }

    container.appendChild(form);
    if (mission.id === 'mission-1') {
      renderChecklist(container, mission.criteria, progress.completed);
    } else if (mission.id === 'mission-2') {
      renderChecklist(container, mission.criteria, progress.completed);
    } else if (mission.id === 'mission-4') {
      renderChecklist(container, mission.criteria, progress.completed);
    } else if (mission.id === 'mission-5') {
      renderChecklist(container, mission.criteria, progress.completed);
    }
    if (feedback && feedback.dataset.tone === 'error') {
      container.appendChild(createElement('p', 'mission-hint', mission.hint || 'Confira os dados e tente novamente.'));
    }
  }

  function render() {
    const state = getState();
    renderMissionCards(state);
    renderDetail(state);
  }

  function finishEligibleMissions(state) {
    let changed = false;
    for (let index = 0; index < missions.length; index += 1) {
      const mission = missions[index];
      const progress = getMissionProgress(state, mission.id);
      if (progress.completed) {
        continue;
      }
      if (index > 0 && !getMissionProgress(state, missions[index - 1].id).completed) {
        break;
      }

      let completed = false;
      if (mission.id === 'mission-1') {
        completed = progress.quizCorrect && Boolean(getTask(state, progress.taskId));
      } else if (mission.id === 'mission-2') {
        completed = progress.prioritySet && Boolean(getTask(state, progress.taskId));
      } else if (mission.id === 'mission-3') {
        const focusedMs = progress.focusSessions.reduce((total, session) => total + session.totalFocusedMs, 0);
        const task = getTask(state, progress.taskId);
        completed = focusedMs >= 3 * 60 * 1000 && Boolean(task && task.completed);
      } else if (mission.id === 'mission-4') {
        completed = progress.choiceCorrect && progress.shortAnswerCorrect;
      } else if (mission.id === 'mission-5') {
        const task = getTask(state, progress.taskId);
        completed = Boolean(task && !progress.taskCompletedAtSelection && task.completed && progress.progressReviewed);
      }

      if (completed) {
        progress.completed = true;
        changed = true;
        state.missions.activeMissionId = missions[index + 1] ? missions[index + 1].id : mission.id;
      } else {
        break;
      }
    }

    if (changed) {
      if (!saveState(state)) {
        return null;
      }
      setFeedback('Missão concluída! A próxima etapa do mapa está disponível.', 'success');
    }
    return changed;
  }

  function refresh(message, tone = 'info') {
    const state = getState();
    const completed = finishEligibleMissions(state);
    if (completed === null) {
      return;
    }
    if (!completed && !saveState(state)) {
      return;
    }
    if (message) {
      setFeedback(message, tone);
    }
    render();
  }

  function submitMission1(answer, taskId) {
    const state = getState();
    if (!isMissionUnlocked(state, 'mission-1')) {
      return false;
    }
    const progress = getMissionProgress(state, 'mission-1');
    progress.taskId = getTask(state, taskId) ? taskId : null;
    progress.quizCorrect = answer === missions[0].answer;
    if (!progress.quizCorrect) {
      refresh('Resposta incorreta. ' + missions[0].hint + ' Você pode tentar novamente sem perder XP.', 'error');
      return false;
    }
    if (!progress.taskId) {
      refresh('Selecione ou crie uma tarefa para concluir a missão.', 'error');
      return false;
    }
    refresh('Resposta correta. Uma tarefa foi selecionada.', 'success');
    return true;
  }

  function setMission2Priority(taskId, priority) {
    const state = getState();
    if (!isMissionUnlocked(state, 'mission-2')) {
      return false;
    }
    const task = getTask(state, taskId);
    const priorities = ['baixa', 'media', 'alta'];
    const taskApi = window.eduEstudos.tasks;
    if (!task || !priorities.includes(priority) || !taskApi || typeof taskApi.updatePriority !== 'function') {
      setFeedback('Selecione uma tarefa e uma prioridade válidas.', 'error');
      return false;
    }
    if (!taskApi.updatePriority(taskId, priority)) {
      setFeedback('Não foi possível guardar a prioridade. Tente novamente.', 'error');
      return false;
    }
    const progress = getMissionProgress(getState(), 'mission-2');
    progress.taskId = taskId;
    progress.prioritySet = true;
    refresh('Prioridade guardada.', 'success');
    return true;
  }

  function normalizeAnswer(value) {
    return typeof value === 'string'
      ? value.trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ')
      : '';
  }

  function submitMission4(choice, shortAnswer) {
    const state = getState();
    if (!isMissionUnlocked(state, 'mission-4')) {
      return false;
    }
    const progress = getMissionProgress(state, 'mission-4');
    const mission = missions[3];
    progress.choiceCorrect = choice === mission.answer;
    progress.shortAnswerCorrect = mission.acceptedShortAnswers.some((answer) => normalizeAnswer(answer) === normalizeAnswer(shortAnswer));

    if (!progress.choiceCorrect || !progress.shortAnswerCorrect) {
      refresh('Ainda não está correto. ' + mission.hint + ' Tente novamente; nenhuma XP foi perdida.', 'error');
      return false;
    }
    refresh('As duas respostas estão corretas.', 'success');
    return true;
  }

  function selectMission5Task(taskId) {
    const state = getState();
    if (!isMissionUnlocked(state, 'mission-5')) {
      return false;
    }
    const task = getTask(state, taskId);
    if (!task || task.completed) {
      refresh('Selecione uma tarefa pessoal pendente para seu plano.', 'error');
      return false;
    }
    const progress = getMissionProgress(state, 'mission-5');
    progress.taskId = taskId;
    progress.taskCompletedAtSelection = Boolean(task.completed);
    refresh('Tarefa selecionada para seu plano.', 'success');
    return true;
  }

  function reviewProgress() {
    const state = getState();
    if (!isMissionUnlocked(state, 'mission-5')) {
      return false;
    }
    getMissionProgress(state, 'mission-5').progressReviewed = true;
    refresh('Progresso consultado.', 'success');
    return true;
  }

  function selectMission(missionId) {
    const state = getState();
    if (!isMissionUnlocked(state, missionId) && !getMissionProgress(state, missionId)?.completed) {
      setFeedback('Essa missão ainda está bloqueada. Conclua a missão anterior primeiro.', 'error');
      return false;
    }
    state.missions.activeMissionId = missionId;
    if (!saveState(state)) return false;
    setFeedback('', 'info');
    render();
    return true;
  }

  function onTasksChanged(tasks) {
    const state = getState();
    if (Array.isArray(tasks)) {
      state.tasks = tasks;
    }
    const first = getMissionProgress(state, 'mission-1');
    if (!first.completed && first.taskId && !getTask(state, first.taskId)) {
      first.taskId = null;
    }
    const second = getMissionProgress(state, 'mission-2');
    if (!second.completed && second.taskId && !getTask(state, second.taskId)) {
      second.taskId = null;
      second.prioritySet = false;
    }
    const fifth = getMissionProgress(state, 'mission-5');
    if (!fifth.completed && fifth.taskId && !getTask(state, fifth.taskId)) {
      fifth.taskId = null;
    }
    finishEligibleMissions(state);
    render();
  }

  function onFocusChanged(focus) {
    const state = getState();
    const progress = getMissionProgress(state, 'mission-3');
    const previousFocusedMs = progress.focusSessions.reduce((total, session) => total + session.totalFocusedMs, 0);
    if (isMissionUnlocked(state, 'mission-3')
      && !progress.completed
      && focus
      && ['running', 'paused', 'completed'].includes(focus.status)
      && focus.sessionId
      && focus.taskId
      && !focus.taskCompletedAtStart
      && (!progress.taskId || progress.taskId === focus.taskId)) {
      progress.taskId = focus.taskId;
      let session = progress.focusSessions.find((entry) => entry.sessionId === focus.sessionId);
      if (!session) {
        session = { sessionId: focus.sessionId, taskId: focus.taskId, totalFocusedMs: 0 };
        progress.focusSessions.push(session);
      }
      session.totalFocusedMs = Math.max(
        session.totalFocusedMs,
        Math.min(25 * 60 * 1000, Math.max(0, Number(focus.totalFocusedMs) || 0)),
      );
    }
    const completed = finishEligibleMissions(state);
    const nextFocusedMs = progress.focusSessions.reduce((total, session) => total + session.totalFocusedMs, 0);
    if (completed === null || !saveState(state)) return;
    if (completed || Math.floor(previousFocusedMs / 60000) !== Math.floor(nextFocusedMs / 60000)) {
      render();
    }
  }

  function init() {
    if (initialized) {
      return;
    }
    initialized = true;
    const list = document.getElementById('mission-list');
    list?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-mission-id]');
      if (button) {
        selectMission(button.dataset.missionId);
      }
    });
    render();
  }

  if (typeof window !== 'undefined') {
    window.eduEstudos = window.eduEstudos || {};
    window.eduEstudos.missions = {
      init,
      getState: () => getState(),
      getMissionStatus: (missionId) => {
        const state = getState();
        const progress = getMissionProgress(state, missionId);
        if (!progress) {
          return 'invalid';
        }
        return progress.completed ? 'completed' : isMissionUnlocked(state, missionId) ? 'available' : 'locked';
      },
      selectMission,
      submitMission1,
      setMission2Priority,
      submitMission4,
      selectMission5Task,
      reviewProgress,
      onTasksChanged,
      onFocusChanged,
      render,
    };
  }
})();