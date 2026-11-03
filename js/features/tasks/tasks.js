(function () {
  const storage = typeof window !== 'undefined' && window.eduEstudos ? window.eduEstudos.storage : globalThis.eduEstudosStorage;

  if (!storage) {
    return;
  }

  const state = storage.getSharedState ? storage.getSharedState() : storage.readStoredState();
  let initialized = false;

  function setFeedback(message, tone = 'info') {
    const feedback = document.getElementById('task-feedback');
    if (!feedback) return;

    feedback.textContent = message || '';
    feedback.dataset.tone = tone;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function renderTaskCount() {
    const countElement = document.getElementById('task-count');
    if (!countElement) return;

    const total = state.tasks.length;
    countElement.textContent = `${total} tarefa${total === 1 ? '' : 's'}`;
  }

  function renderTaskList() {
    const list = document.getElementById('task-list');
    const emptyState = document.getElementById('task-empty');
    if (!list || !emptyState) return;

    renderTaskCount();
    list.innerHTML = '';

    if (!state.tasks.length) {
      emptyState.hidden = false;
      return;
    }

    emptyState.hidden = true;

    const sortedTasks = [...state.tasks].sort((left, right) => {
      const leftDate = new Date(left.updatedAt || left.createdAt).getTime();
      const rightDate = new Date(right.updatedAt || right.createdAt).getTime();
      return rightDate - leftDate;
    });

    sortedTasks.forEach((task) => {
      const item = document.createElement('li');
      item.className = 'task-item' + (task.completed ? ' task-item--completed' : '');
      item.dataset.taskId = task.id;

      const priorityLabel = { baixa: 'Baixa', media: 'Média', alta: 'Alta' }[task.priority] || 'Média';
      const categoryLabel = { estudo: 'Estudo', leitura: 'Leitura', projeto: 'Projeto' }[task.category] || 'Estudo';
      const escapedTaskId = escapeHtml(task.id);

      item.innerHTML = `
        <div class="task-item__header">
          <button type="button" class="task-toggle" data-action="toggle" data-id="${escapedTaskId}" aria-label="${task.completed ? 'Marcar como pendente' : 'Marcar como concluída'}">
            <span aria-hidden="true">${task.completed ? '✓' : ''}</span>
          </button>
          <div class="task-item__content">
            <h4>${escapeHtml(task.title)}</h4>
            ${task.details ? `<p>${escapeHtml(task.details)}</p>` : '<p class="task-item__hint">Sem detalhes extras.</p>'}
          </div>
        </div>
        <div class="task-item__meta">
          <span class="task-badge task-badge--${task.category}">${categoryLabel}</span>
          <span class="task-badge task-badge--priority">${priorityLabel}</span>
          ${task.completed ? '<span class="task-badge task-badge--done">Concluída</span>' : ''}
        </div>
        <div class="task-item__actions">
          <button type="button" class="task-action task-action--secondary" data-action="edit" data-id="${escapedTaskId}">Editar</button>
          <button type="button" class="task-action task-action--danger" data-action="delete" data-id="${escapedTaskId}">Remover</button>
        </div>
      `;

      list.appendChild(item);
    });
  }

  function resetForm() {
    const form = document.getElementById('task-form');
    const titleInput = document.getElementById('task-title');
    const detailsInput = document.getElementById('task-details');
    const categoryInput = document.getElementById('task-category');
    const priorityInput = document.getElementById('task-priority');
    const submitButton = document.getElementById('task-submit');
    const cancelButton = document.getElementById('task-cancel-edit');
    const taskIdInput = document.getElementById('task-id');

    if (!form || !titleInput || !detailsInput || !categoryInput || !priorityInput || !taskIdInput) return;

    form.reset();
    taskIdInput.value = '';
    categoryInput.value = 'estudo';
    priorityInput.value = 'media';
    submitButton.textContent = 'Adicionar tarefa';
    cancelButton.hidden = true;
    titleInput.focus();
  }

  function fillFormForEditing(taskId) {
    const task = state.tasks.find((item) => item.id === taskId);
    if (!task) return;

    const titleInput = document.getElementById('task-title');
    const detailsInput = document.getElementById('task-details');
    const categoryInput = document.getElementById('task-category');
    const priorityInput = document.getElementById('task-priority');
    const taskIdInput = document.getElementById('task-id');
    const submitButton = document.getElementById('task-submit');
    const cancelButton = document.getElementById('task-cancel-edit');

    if (!titleInput || !detailsInput || !categoryInput || !priorityInput || !taskIdInput || !submitButton || !cancelButton) return;

    titleInput.value = task.title;
    detailsInput.value = task.details || '';
    categoryInput.value = task.category;
    priorityInput.value = task.priority;
    taskIdInput.value = task.id;
    submitButton.textContent = 'Salvar alterações';
    cancelButton.hidden = false;
    titleInput.focus();
  }

  function saveTaskState() {
    try {
      const snapshot = storage.saveStoredState(state);
      Object.assign(state, snapshot);
    } catch (error) {
      console.error('Não foi possível guardar as tarefas.', error);
      setFeedback('Não foi possível salvar. Verifique o armazenamento e tente novamente.', 'error');
      renderTaskList();
      window.eduEstudos?.progression?.render?.();
      window.eduEstudos?.shop?.render?.();
      window.eduEstudos?.missions?.render?.();
      window.eduEstudos?.parentSummary?.render?.();
      window.eduEstudos?.focus?.refreshTasks?.();
      return false;
    }
    renderTaskList();
    if (window.eduEstudos?.progression?.render) {
      window.eduEstudos.progression.render();
    }
    if (window.eduEstudos?.shop?.render) {
      window.eduEstudos.shop.render();
    }
    if (window.eduEstudos?.missions?.onTasksChanged) {
      window.eduEstudos.missions.onTasksChanged(state.tasks);
    }
    if (window.eduEstudos?.parentSummary?.render) {
      window.eduEstudos.parentSummary.render();
    }
    if (typeof window !== 'undefined' && window.eduEstudos && window.eduEstudos.focus && typeof window.eduEstudos.focus.refreshTasks === 'function') {
      window.eduEstudos.focus.refreshTasks();
    }
    return true;
  }

  function handleSubmit(event) {
    event.preventDefault();

    const titleInput = document.getElementById('task-title');
    const detailsInput = document.getElementById('task-details');
    const categoryInput = document.getElementById('task-category');
    const priorityInput = document.getElementById('task-priority');
    const taskIdInput = document.getElementById('task-id');

    if (!titleInput || !detailsInput || !categoryInput || !priorityInput || !taskIdInput) return;

    const title = titleInput.value.trim();

    if (!title) {
      setFeedback('Digite um título para a tarefa antes de salvar.', 'error');
      titleInput.focus();
      return;
    }

    const sanitizedDetails = detailsInput.value.trim().slice(0, 500);
    const taskId = taskIdInput.value || null;
    const now = new Date().toISOString();

    if (taskId) {
      const task = state.tasks.find((item) => item.id === taskId);
      if (!task) {
        setFeedback('A tarefa selecionada não foi encontrada.', 'error');
        return;
      }

      task.title = title;
      task.details = sanitizedDetails;
      task.category = categoryInput.value || 'estudo';
      task.priority = priorityInput.value || 'media';
      task.updatedAt = now;
    } else {
      state.tasks.push({
        id: 'task-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
        title,
        details: sanitizedDetails,
        category: categoryInput.value || 'estudo',
        priority: priorityInput.value || 'media',
        completed: false,
        xpAwarded: false,
        createdAt: now,
        updatedAt: now,
      });
    }

    if (!saveTaskState()) {
      return;
    }
    setFeedback(taskId ? 'Tarefa atualizada com sucesso.' : 'Nova tarefa adicionada com sucesso.', 'success');
    resetForm();
  }

  function handleListClick(event) {
    const target = event.target.closest('[data-action]');
    if (!target) return;

    const action = target.dataset.action;
    const taskId = target.dataset.id;
    if (!taskId) return;

    if (action === 'toggle') {
      const task = state.tasks.find((item) => item.id === taskId);
      if (!task) return;

      const wasCompleted = Boolean(task.completed);
      task.completed = !task.completed;

      if (task.completed && !wasCompleted && !task.xpAwarded) {
        const progression = window.eduEstudos?.progression;
        if (!progression || typeof progression.awardTaskXp !== 'function' || !progression.awardTaskXp(task)) {
          task.completed = wasCompleted;
          setFeedback('Não foi possível registrar o XP desta tarefa. Tente novamente.', 'error');
          return;
        }
      }

      task.updatedAt = new Date().toISOString();
      if (!saveTaskState()) return;
      setFeedback(task.completed ? 'Tarefa concluída! Boa jornada.' : 'Tarefa marcada como pendente.', 'success');
      return;
    }

    if (action === 'edit') {
      fillFormForEditing(taskId);
      setFeedback('Edite os dados da tarefa e salve as alterações.', 'info');
      return;
    }

    if (action === 'delete') {
      const task = state.tasks.find((item) => item.id === taskId);
      if (!task) return;

      const shouldDelete = window.confirm(`Remover a tarefa "${task.title}"?`);
      if (!shouldDelete) return;

      state.tasks = state.tasks.filter((item) => item.id !== taskId);
      if (!saveTaskState()) return;
      setFeedback('Tarefa removida.', 'success');

      if (document.getElementById('task-id')?.value === taskId) {
        resetForm();
      }
    }
  }

  function init() {
    if (initialized) {
      return;
    }

    const form = document.getElementById('task-form');
    const list = document.getElementById('task-list');
    const cancelButton = document.getElementById('task-cancel-edit');

    if (!form || !list) {
      return;
    }

    form.addEventListener('submit', handleSubmit);
    list.addEventListener('click', handleListClick);
    cancelButton?.addEventListener('click', resetForm);
    initialized = true;
    renderTaskList();
    setFeedback('Seu painel de tarefas está pronto para registrar novos estudos.', 'info');
  }

  const api = {
    init,
    getTasks: () => [...state.tasks],
    addTask: (task) => {
      const nextTask = {
        id: task.id || 'task-' + Date.now().toString(36),
        title: String(task.title || '').trim(),
        details: String(task.details || '').trim(),
        category: task.category || 'estudo',
        priority: task.priority || 'media',
        completed: Boolean(task.completed),
        xpAwarded: Boolean(task.xpAwarded),
        createdAt: task.createdAt || new Date().toISOString(),
        updatedAt: task.updatedAt || new Date().toISOString(),
      };

      if (!nextTask.title) {
        throw new Error('Título da tarefa obrigatório.');
      }

      state.tasks.push(nextTask);
      if (!saveTaskState()) {
        throw new Error('Não foi possível salvar a tarefa no armazenamento do navegador.');
      }
      return nextTask;
    },
    updatePriority: (taskId, priority) => {
      const task = state.tasks.find((item) => item.id === taskId);
      if (!task || !['baixa', 'media', 'alta'].includes(priority)) {
        return false;
      }

      task.priority = priority;
      task.updatedAt = new Date().toISOString();
      return saveTaskState();
    },
  };

  if (typeof window !== 'undefined') {
    window.eduEstudos = window.eduEstudos || {};
    window.eduEstudos.tasks = api;
  }

})();
