import { runInNewContext } from 'node:vm';

const focusSource = await Deno.readTextFile(new URL('../js/features/focus/focus.js', import.meta.url));
const progressionSource = await Deno.readTextFile(new URL('../js/features/progression/progression.js', import.meta.url));

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: esperado ${expected}, recebido ${actual}`);
  }
}

function createHarness(existingState, initialTime = Date.now()) {
  let now = initialTime;
  let intervalHandler = null;
  const elements = new Map();
  const state = existingState || {
    tasks: [{ id: 'task-1', title: 'Tarefa fictícia', completed: false }],
    focus: {
      taskId: null,
      durationMinutes: 15,
      status: 'idle',
      startedAt: null,
      lastTickAt: null,
      remainingMs: 15 * 60 * 1000,
      totalFocusedMs: 0,
      completedAt: null,
    },
    progress: { totalXp: 0, spentXp: 0, level: 1, totalFocusedMs: 0, selectedItem: null, inventory: [] },
  };

  function getElement(id) {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        value: '',
        textContent: '',
        disabled: false,
        style: {},
        children: [],
        listeners: new Map(),
        addEventListener(type, callback) {
          this.listeners.set(type, callback);
        },
        appendChild(child) {
          this.children.push(child);
        },
      });
    }

    return elements.get(id);
  }

  class FakeDate extends Date {
    constructor(value) {
      super(value === undefined ? now : value);
    }

    static now() {
      return now;
    }
  }

  const storage = {
    createDefaultFocusState: () => ({
      taskId: null,
      durationMinutes: 15,
      status: 'idle',
      startedAt: null,
      lastTickAt: null,
      remainingMs: 15 * 60 * 1000,
      totalFocusedMs: 0,
      completedAt: null,
    }),
    normalizeFocusState: (focus) => ({ ...focus }),
    createDefaultProgressState: () => ({
      totalXp: 0,
      spentXp: 0,
      level: 1,
      totalFocusedMs: 0,
      selectedItem: null,
      inventory: [],
    }),
    normalizeProgressState: (progress) => ({
      totalXp: Number(progress.totalXp) || 0,
      spentXp: Number(progress.spentXp) || 0,
      level: Number(progress.level) || 1,
      totalFocusedMs: Number(progress.totalFocusedMs) || 0,
      selectedItem: progress.selectedItem || null,
      inventory: Array.isArray(progress.inventory) ? [...progress.inventory] : [],
    }),
    getSharedState: () => state,
    readStoredState: () => state,
    saveStoredState(nextState) {
      Object.assign(state, JSON.parse(JSON.stringify(nextState)));
      return state;
    },
  };
  const window = {
    eduEstudos: { storage },
    clearInterval() {},
    setInterval(callback) {
      intervalHandler = callback;
      return 1;
    },
  };
  const document = {
    getElementById: getElement,
    createElement: () => ({
      value: '',
      textContent: '',
      selected: false,
    }),
  };

  runInNewContext(focusSource, { window, document, Date: FakeDate });
  runInNewContext(progressionSource, { window, document, Date: FakeDate });
  window.eduEstudos.progression.init();
  window.eduEstudos.focus.init();

  return {
    elements,
    state,
    focus: window.eduEstudos.focus,
    advanceTime(milliseconds) {
      now += milliseconds;
    },
    currentTime() {
      return now;
    },
    tick() {
      intervalHandler();
    },
    dispatch(id, type) {
      elements.get(id).listeners.get(type)?.();
    },
  };
}

Deno.test('pausa não conta; conclusão antecipada preserva apenas o tempo focado', () => {
  const harness = createHarness();
  harness.elements.get('focus-duration').value = '5';
  harness.focus.startFocusSession();
  harness.advanceTime(12_000);
  harness.focus.pauseFocusSession();

  assertEquals(harness.focus.getState().status, 'paused', 'estado após pausa');
  assertEquals(harness.focus.getState().remainingMs, 288_000, 'tempo restante após 12 segundos');
  assertEquals(harness.focus.getState().totalFocusedMs, 12_000, 'tempo focado antes da pausa');
  assertEquals(harness.state.progress.totalFocusedMs, 12_000, 'tempo agregado para o resumo local');

  harness.advanceTime(90_000);
  harness.tick();
  assertEquals(harness.focus.getState().remainingMs, 288_000, 'tempo restante sem contar a pausa');

  harness.focus.resumeFocusSession();
  harness.advanceTime(6_000);
  harness.focus.completeFocusSession();
  assertEquals(harness.focus.getState().status, 'completed', 'estado após conclusão antecipada');
  assertEquals(harness.focus.getState().totalFocusedMs, 18_000, 'tempo focado real');
  assertEquals(harness.state.progress.totalFocusedMs, 18_000, 'tempo total agregado sem contar a pausa');
  assertEquals(harness.focus.getState().remainingMs, 0, 'temporizador encerrado');

  harness.focus.completeFocusSession();
  assertEquals(harness.focus.getState().totalFocusedMs, 18_000, 'conclusão repetida não altera o tempo');
});

Deno.test('sessão recuperada conta o tempo fechado e nunca excede a duração planeada', () => {
  const harness = createHarness();
  harness.elements.get('focus-duration').value = '5';
  harness.focus.startFocusSession();
  harness.advanceTime(60_000);
  const reopened = createHarness(harness.state, harness.currentTime());
  reopened.tick();
  assertEquals(reopened.focus.getState().remainingMs, 240_000, 'tempo após reabrir a sessão');

  reopened.advanceTime(300_000);
  reopened.tick();
  assertEquals(reopened.focus.getState().status, 'completed', 'sessão concluída ao atingir o limite');
  assertEquals(reopened.focus.getState().remainingMs, 0, 'tempo restante no limite');
  assertEquals(reopened.focus.getState().totalFocusedMs, 300_000, 'tempo focado limitado ao planeado');
  assertEquals(reopened.state.progress.totalFocusedMs, 300_000, 'tempo total resumido limitado ao planeado');

  reopened.advanceTime(30_000);
  reopened.tick();
  assertEquals(reopened.focus.getState().totalFocusedMs, 300_000, 'ticks posteriores não duplicam tempo');
});

Deno.test('duração é limitada entre 5 e 25 minutos e tarefa inválida não inicia', () => {
  const harness = createHarness();
  harness.elements.get('focus-duration').value = '2';
  harness.elements.get('focus-task').value = 'task-inexistente';
  harness.focus.startFocusSession();
  assertEquals(harness.focus.getState().status, 'idle', 'tarefa inexistente não inicia');

  harness.elements.get('focus-task').value = 'task-1';
  harness.focus.startFocusSession();
  assertEquals(harness.focus.getState().durationMinutes, 5, 'duração mínima');

  harness.focus.resetFocusSession();
  harness.elements.get('focus-duration').value = '30';
  harness.focus.startFocusSession();
  assertEquals(harness.focus.getState().durationMinutes, 25, 'duração máxima');
});

Deno.test('duração e tarefa ficam bloqueadas durante sessão ativa ou pausada', () => {
  const harness = createHarness();
  const durationField = harness.elements.get('focus-duration');
  const taskSelect = harness.elements.get('focus-task');
  durationField.value = '5';
  taskSelect.value = 'task-1';
  harness.focus.startFocusSession();

  assertEquals(durationField.disabled, true, 'duração bloqueada enquanto o foco está em andamento');
  assertEquals(taskSelect.disabled, true, 'tarefa bloqueada enquanto o foco está em andamento');
  durationField.value = '25';
  harness.dispatch('focus-duration', 'change');
  assertEquals(harness.focus.getState().durationMinutes, 5, 'alteração do campo não muda a duração da sessão');
  assertEquals(durationField.value, '5', 'campo restaura a duração definida ao iniciar');

  harness.advanceTime(60_000);
  harness.focus.pauseFocusSession();
  durationField.value = '25';
  harness.dispatch('focus-duration', 'change');
  assertEquals(harness.focus.getState().durationMinutes, 5, 'duração também fica bloqueada em pausa');
  assertEquals(harness.focus.getState().remainingMs, 240_000, 'tempo restante não aumenta durante a pausa');

  harness.focus.resumeFocusSession();
  harness.advanceTime(60_000);
  harness.focus.completeFocusSession();
  assertEquals(harness.focus.getState().totalFocusedMs, 120_000, 'tempo registrado corresponde ao tempo realmente focado');
  assertEquals(harness.state.progress.totalXp, 4, 'XP calculado apenas pelos dois minutos focados');
});

Deno.test('XP de foco usa minutos completos e concede bônus só para tarefa concluída durante a sessão', () => {
  const harness = createHarness();
  harness.elements.get('focus-duration').value = '5';
  harness.focus.startFocusSession();
  harness.advanceTime(150_000);
  harness.state.tasks[0].completed = true;
  harness.focus.completeFocusSession();

  assertEquals(harness.state.progress.totalXp, 14, '4 XP por dois minutos completos e bônus de 10 XP');
  assertEquals(harness.focus.getState().xpAwarded, true, 'recompensa marcada como concedida');

  harness.focus.completeFocusSession();
  harness.tick();
  assertEquals(harness.state.progress.totalXp, 14, 'sessão repetida não duplica XP');
});

Deno.test('XP de foco é limitado ao plano e não dá bônus por tarefa já concluída', () => {
  const capped = createHarness();
  capped.elements.get('focus-duration').value = '5';
  capped.focus.startFocusSession();
  capped.advanceTime(7 * 60_000);
  capped.tick();
  assertEquals(capped.state.progress.totalXp, 10, 'XP base limitado a cinco minutos planeados');

  const alreadyCompleted = createHarness();
  alreadyCompleted.state.tasks[0].completed = true;
  alreadyCompleted.state.focus.taskId = 'task-1';
  alreadyCompleted.focus.refreshTasks();
  alreadyCompleted.elements.get('focus-duration').value = '5';
  alreadyCompleted.focus.startFocusSession();
  alreadyCompleted.advanceTime(60_000);
  alreadyCompleted.focus.completeFocusSession();
  assertEquals(alreadyCompleted.state.progress.totalXp, 2, 'sem bônus para tarefa concluída antes da sessão');
});
