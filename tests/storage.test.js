import { runInNewContext } from 'node:vm';

const storageSource = await Deno.readTextFile(new URL('../js/core/storage.js', import.meta.url));

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: esperado ${expected}, recebido ${actual}`);
  }
}

Deno.test('estado do foco migra sessões antigas e persiste marcações de XP', () => {
  let storedValue = null;
  const localStorage = {
    getItem: () => storedValue,
    setItem: (_key, value) => {
      storedValue = value;
    },
  };
  const window = {};

  runInNewContext(storageSource, { window, localStorage });
  const storage = window.eduEstudos.storage;

  const defaults = storage.createDefaultFocusState();
  assertEquals(defaults.taskCompletedAtStart, false, 'estado inicial da tarefa');
  assertEquals(defaults.xpAwarded, false, 'estado inicial da recompensa');

  const previousCompletedSession = storage.normalizeFocusState({
    durationMinutes: 5,
    status: 'completed',
    totalFocusedMs: 600_000,
  });
  assertEquals(previousCompletedSession.totalFocusedMs, 300_000, 'tempo legado limitado à duração');
  assertEquals(previousCompletedSession.taskCompletedAtStart, true, 'sessão antiga não recebe bônus retroativo');
  assertEquals(previousCompletedSession.xpAwarded, true, 'sessão concluída antiga não recebe XP retroativo');

  const state = storage.createDefaultState();
  state.focus = {
    ...defaults,
    durationMinutes: 5,
    status: 'completed',
    totalFocusedMs: 120_000,
    taskCompletedAtStart: false,
    xpAwarded: true,
  };
  storage.saveStoredState(state);
  const restored = storage.readStoredState().focus;
  assertEquals(restored.totalFocusedMs, 120_000, 'tempo válido persistido');
  assertEquals(restored.taskCompletedAtStart, false, 'elegibilidade persistida');
  assertEquals(restored.xpAwarded, true, 'prevenção de recompensa duplicada persistida');
});

Deno.test('progresso normalizado mantém saldo, inventário, item equipado e nível coerentes', () => {
  const window = {};
  const localStorage = { getItem: () => null, setItem() {} };
  runInNewContext(storageSource, { window, localStorage });

  const progress = window.eduEstudos.storage.normalizeProgressState({
    totalXp: 199.8,
    spentXp: 500,
    level: 99,
    selectedItem: 'nao-desbloqueado',
    inventory: ['item-1', 'item-1', '', 3, 'item-2'],
  });

  assertEquals(progress.totalXp, 199, 'XP total convertido para inteiro');
  assertEquals(progress.spentXp, 199, 'gasto limitado ao XP total');
  assertEquals(progress.level, 1, 'nível calculado a partir do XP total');
  assertEquals(progress.selectedItem, null, 'item equipado deve estar desbloqueado');
  assertEquals(progress.inventory.length, 2, 'inventário filtrado e sem duplicações');
});

Deno.test('estado das missões inicia com cinco etapas e mantém progresso parcial válido', () => {
  const window = {};
  const localStorage = { getItem: () => null, setItem() {} };
  runInNewContext(storageSource, { window, localStorage });
  const storage = window.eduEstudos.storage;
  const defaults = storage.createDefaultMissionsState();
  assertEquals(Object.keys(defaults.progress).length, 5, 'cinco missões inicializadas');
  assertEquals(defaults.progress['mission-1'].completed, false, 'missões começam pendentes');

  const normalized = storage.normalizeMissionsState({
    activeMissionId: 'mission-3',
    progress: {
      'mission-1': { completed: true, quizCorrect: true, taskId: 'task-1' },
      'mission-3': {
        taskId: 'task-1',
        focusSessions: [
          { sessionId: 'focus-1', taskId: 'task-1', totalFocusedMs: 90_000 },
          { sessionId: 'focus-2', taskId: 'task-2', totalFocusedMs: 90_000 },
        ],
      },
    },
  });
  assertEquals(normalized.activeMissionId, 'mission-3', 'missão ativa persistida');
  assertEquals(normalized.progress['mission-1'].completed, true, 'conclusão persistida');
  assertEquals(normalized.progress['mission-3'].focusSessions.length, 1, 'foco de tarefa incompatível descartado');
});

Deno.test('estrutura inválida e flags booleanas inválidas bloqueiam a gravação sem substituir dados locais', () => {
  const invalidStates = [
    { tasks: 'not-an-array' },
    { tasks: [{ id: 'task-1', title: 'Tarefa', completed: 'false' }] },
    { missions: { progress: { 'mission-1': { completed: 'false' } } } },
  ];

  invalidStates.forEach((invalidState) => {
    const rawValue = JSON.stringify(invalidState);
    let writes = 0;
    const localStorage = {
      getItem: () => rawValue,
      setItem: () => writes++,
    };
    const window = {};
    runInNewContext(storageSource, { window, localStorage, console: { warn() {}, error() {} } });

    const storage = window.eduEstudos.storage;
    const fallback = storage.getSharedState();
    assertEquals(storage.hasLoadError(), true, 'payload malformado identificado');
    let threw = false;
    try {
      storage.saveStoredState(fallback);
    } catch {
      threw = true;
    }
    assertEquals(threw, true, 'salvamento de fallback bloqueado até reposição explícita');
    assertEquals(writes, 0, 'dados originais não são sobrescritos');
  });
});

Deno.test('falha de gravação é sinalizada e restaura o estado compartilhado persistido', () => {
  let rawValue = null;
  const localStorage = {
    getItem: () => rawValue,
    setItem: (_key, value) => {
      throw new Error('quota exceeded');
    },
  };
  const window = {};
  runInNewContext(storageSource, {
    window,
    localStorage,
    console: { warn() {}, error() {} },
  });

  const storage = window.eduEstudos.storage;
  const state = storage.getSharedState();
  state.tasks.push({ id: 'task-1', title: 'Não deve persistir' });
  let errorMessage = '';
  try {
    storage.saveStoredState(state);
  } catch (error) {
    errorMessage = error.message;
  }

  assertEquals(errorMessage.includes('Verifique o armazenamento'), true, 'falha apresentada ao chamador');
  assertEquals(state.tasks.length, 0, 'estado em memória revertido para o último salvamento válido');
  assertEquals(rawValue, null, 'valor local não é substituído');
});
