import { runInNewContext } from 'node:vm';

const [storageSource, configSource, missionsSource] = await Promise.all([
  Deno.readTextFile(new URL('../js/core/storage.js', import.meta.url)),
  Deno.readTextFile(new URL('../js/config/missions-config.js', import.meta.url)),
  Deno.readTextFile(new URL('../js/features/missions/missions.js', import.meta.url)),
]);

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: esperado ${expected}, recebido ${actual}`);
  }
}

function createHarness(data = new Map()) {
  const localStorage = {
    getItem: (key) => data.get(key) || null,
    setItem: (key, value) => data.set(key, value),
  };
  const document = { getElementById: () => null };
  const window = { eduEstudos: {} };

  runInNewContext(storageSource, { window, document, localStorage, Date });
  runInNewContext(configSource, { window, document });
  runInNewContext(missionsSource, { window, document });

  const storage = window.eduEstudos.storage;
  const state = storage.getSharedState();
  window.eduEstudos.tasks = {
    updatePriority(taskId, priority) {
      const task = state.tasks.find((entry) => entry.id === taskId);
      if (!task || !['baixa', 'media', 'alta'].includes(priority)) {
        return false;
      }
      task.priority = priority;
      window.eduEstudos.missions.onTasksChanged(state.tasks);
      return true;
    },
  };
  window.eduEstudos.missions.init();

  return { app: window.eduEstudos, state, data };
}

function addTask(harness, id = 'task-1') {
  harness.state.tasks.push({
    id,
    title: `Tarefa ${id}`,
    details: '',
    category: 'estudo',
    priority: 'media',
    completed: false,
    xpAwarded: false,
  });
  harness.app.missions.onTasksChanged(harness.state.tasks);
}

Deno.test('missões desbloqueiam em sequência, respostas podem ser refeitas e progresso permanece ao reabrir', () => {
  const data = new Map();
  const harness = createHarness(data);
  addTask(harness);
  const initialXp = harness.state.progress.totalXp;

  assertEquals(harness.app.missions.getMissionStatus('mission-1'), 'available', 'primeira missão disponível');
  assertEquals(harness.app.missions.getMissionStatus('mission-2'), 'locked', 'segunda missão inicialmente bloqueada');
  assertEquals(harness.app.missions.submitMission1('weather', 'task-1'), false, 'resposta errada aceita nova tentativa');
  assertEquals(harness.state.progress.totalXp, initialXp, 'resposta errada não reduz nem concede XP');
  assertEquals(harness.app.missions.submitMission1('study-task', 'task-1'), true, 'resposta correta e tarefa selecionada');
  assertEquals(harness.app.missions.getMissionStatus('mission-1'), 'completed', 'missão 1 concluída');
  assertEquals(harness.app.missions.getMissionStatus('mission-2'), 'available', 'missão seguinte desbloqueada');
});

Deno.test('cinco critérios concluem capítulo sem recompensas duplicadas e sobrevivem à reabertura', () => {
  const data = new Map();
  const harness = createHarness(data);
  addTask(harness);
  const xpBeforeMissions = harness.state.progress.totalXp;

  harness.app.missions.submitMission1('study-task', 'task-1');
  assertEquals(harness.app.missions.getMissionStatus('mission-1'), 'completed', 'missão 1 concluída');
  assertEquals(harness.app.missions.getMissionStatus('mission-2'), 'available', 'missão 2 desbloqueada');
  assertEquals(harness.app.missions.setMission2Priority('task-1', 'alta'), true, 'prioridade selecionada e salva');
  assertEquals(harness.state.tasks[0].priority, 'alta', 'prioridade aplicada à tarefa pessoal');
  assertEquals(harness.app.missions.getMissionStatus('mission-3'), 'available', 'missão 3 desbloqueada');

  harness.app.missions.onFocusChanged({
    sessionId: 'session-one',
    taskId: 'task-1',
    status: 'running',
    taskCompletedAtStart: false,
    totalFocusedMs: 120_000,
  });
  harness.app.missions.onFocusChanged({
    sessionId: 'session-one',
    taskId: 'task-1',
    status: 'paused',
    taskCompletedAtStart: false,
    totalFocusedMs: 120_000,
  });
  harness.app.missions.onFocusChanged({
    sessionId: 'session-two',
    taskId: 'task-1',
    status: 'completed',
    taskCompletedAtStart: false,
    totalFocusedMs: 60_000,
  });
  assertEquals(harness.state.missions.progress['mission-3'].focusSessions.length, 2, 'sessões não são duplicadas por ticks repetidos');
  harness.state.tasks[0].completed = true;
  harness.app.missions.onTasksChanged(harness.state.tasks);
  assertEquals(harness.app.missions.getMissionStatus('mission-3'), 'completed', '3 minutos válidos e tarefa concluída completam missão 3');
  assertEquals(harness.app.missions.getMissionStatus('mission-4'), 'available', 'missão 4 desbloqueada');

  assertEquals(harness.app.missions.submitMission4('2', 'dois lados'), false, 'resposta incorreta permite nova tentativa');
  assertEquals(harness.state.progress.totalXp, xpBeforeMissions, 'respostas de missão não pagam nem retiram XP');
  assertEquals(harness.app.missions.submitMission4('3', 'Tres lados'), true, 'resposta curta configurada aceita sem diferença de acento');
  assertEquals(harness.app.missions.getMissionStatus('mission-4'), 'completed', 'missão 4 concluída');
  assertEquals(harness.app.missions.getMissionStatus('mission-5'), 'available', 'missão 5 desbloqueada');

  addTask(harness, 'task-5');
  assertEquals(harness.app.missions.selectMission5Task('task-5'), true, 'tarefa pessoal pendente escolhida');
  assertEquals(harness.app.missions.reviewProgress(), true, 'progresso consultado');
  const taskForMissionFive = harness.state.tasks.find((task) => task.id === 'task-5');
  taskForMissionFive.completed = true;
  harness.app.missions.onTasksChanged(harness.state.tasks);
  assertEquals(harness.app.missions.getMissionStatus('mission-5'), 'completed', 'tarefa concluída e revisão completam missão 5');
  assertEquals(harness.state.progress.totalXp, xpBeforeMissions, 'concluir missões não concede XP não especificado');

  const reopened = createHarness(data);
  assertEquals(reopened.app.missions.getMissionStatus('mission-5'), 'completed', 'conclusão persiste após reabertura');
  assertEquals(reopened.app.missions.getMissionStatus('mission-4'), 'completed', 'missões concluídas podem ser revisitadas');
  assertEquals(reopened.app.missions.selectMission('mission-2'), true, 'missão concluída pode ser reaberta');
  assertEquals(reopened.app.missions.getMissionStatus('mission-5'), 'completed', 'revisitar não desfaz progresso');
});

Deno.test('progresso parcial de quiz e foco persiste; missões bloqueadas não podem ser abertas', () => {
  const data = new Map();
  const harness = createHarness(data);
  addTask(harness);
  assertEquals(harness.app.missions.selectMission('mission-4'), false, 'missão bloqueada não abre');
  harness.app.missions.submitMission1('weather', 'task-1');
  const reopened = createHarness(data);
  assertEquals(reopened.app.missions.getState().missions.progress['mission-1'].taskId, 'task-1', 'tarefa selecionada preservada');
  assertEquals(reopened.app.missions.getState().missions.progress['mission-1'].quizCorrect, false, 'resposta errada não é registrada como correta');

  reopened.app.missions.submitMission1('study-task', 'task-1');
  reopened.app.missions.setMission2Priority('task-1', 'media');
  reopened.app.missions.onFocusChanged({
    sessionId: 'persisted-focus',
    taskId: 'task-1',
    status: 'paused',
    taskCompletedAtStart: false,
    totalFocusedMs: 90_000,
  });
  const afterFocusReopen = createHarness(data);
  assertEquals(afterFocusReopen.state.missions.progress['mission-3'].focusSessions[0].totalFocusedMs, 90_000, 'foco parcial preservado após pausa e reabertura');
});
