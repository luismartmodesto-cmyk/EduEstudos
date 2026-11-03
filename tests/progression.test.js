import { runInNewContext } from 'node:vm';

const [tasksSource, progressionSource, shopSource] = await Promise.all([
  Deno.readTextFile(new URL('../js/features/tasks/tasks.js', import.meta.url)),
  Deno.readTextFile(new URL('../js/features/progression/progression.js', import.meta.url)),
  Deno.readTextFile(new URL('../js/features/shop/shop.js', import.meta.url)),
]);

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: esperado ${expected}, recebido ${actual}`);
  }
}

function createHarness(totalXp = 0) {
  const elements = new Map();
  const state = {
    tasks: [],
    progress: {
      totalXp,
      spentXp: 0,
      level: 1,
      selectedItem: null,
      inventory: [],
    },
  };

  function getElement(id) {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        value: '',
        textContent: '',
        innerHTML: '',
        disabled: false,
        hidden: false,
        style: {},
        dataset: {},
        children: [],
        listeners: new Map(),
        addEventListener(type, callback) {
          this.listeners.set(type, callback);
        },
        appendChild(child) {
          this.children.push(child);
        },
        focus() {},
        reset() {},
      });
    }

    return elements.get(id);
  }

  const storage = {
    createDefaultProgressState: () => ({
      totalXp: 0,
      spentXp: 0,
      level: 1,
      selectedItem: null,
      inventory: [],
    }),
    normalizeProgressState: (progress) => ({
      totalXp: Number(progress.totalXp) || 0,
      spentXp: Number(progress.spentXp) || 0,
      level: Number(progress.level) || 1,
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
    confirm: () => true,
  };
  const document = {
    getElementById: getElement,
    createElement: () => ({
      style: {},
      dataset: {},
      children: [],
      appendChild(child) {
        this.children.push(child);
      },
    }),
  };

  runInNewContext(tasksSource, { window, document, Date });
  runInNewContext(progressionSource, { window, document, Date });
  runInNewContext(shopSource, { window, document, Date });
  window.eduEstudos.tasks.init();
  window.eduEstudos.progression.init();
  window.eduEstudos.shop.init();

  return { elements, state, app: window.eduEstudos };
}

Deno.test('concluir tarefa concede 5 XP uma vez e atualiza progresso e saldo da loja', () => {
  const harness = createHarness();
  harness.app.tasks.addTask({ id: 'task-1', title: 'Tarefa fictícia' });
  const list = harness.elements.get('task-list');
  const click = () => list.listeners.get('click')({
    target: {
      closest: () => ({ dataset: { action: 'toggle', id: 'task-1' } }),
    },
  });

  click();
  assertEquals(harness.state.progress.totalXp, 5, 'XP após primeira conclusão');
  assertEquals(harness.state.tasks[0].xpAwarded, true, 'marcação de XP concedido');
  assertEquals(harness.elements.get('progress-xp-value').textContent, '5 XP', 'XP exibido no progresso');
  assertEquals(harness.elements.get('shop-balance').textContent, '5 XP disponíveis', 'saldo exibido na loja');

  click();
  click();
  assertEquals(harness.state.progress.totalXp, 5, 'reconcluir tarefa não duplica XP');
});

Deno.test('compra é deduzida uma vez e equipar item desbloqueado não tem custo', () => {
  const harness = createHarness(30);
  harness.app.shop.purchaseItem('mochila-aventureira');
  assertEquals(harness.state.progress.spentXp, 30, 'custo da primeira compra');
  assertEquals(harness.state.progress.selectedItem, 'mochila-aventureira', 'item equipado após compra');
  assertEquals(harness.elements.get('progress-available-xp').textContent, '0 XP', 'saldo disponível atualizado');

  harness.app.shop.purchaseItem('mochila-aventureira');
  assertEquals(harness.state.progress.spentXp, 30, 'compra repetida não cobra novamente');

  harness.state.progress.inventory.push('chapu-pesquisa');
  harness.app.shop.purchaseItem('chapu-pesquisa');
  assertEquals(harness.state.progress.spentXp, 30, 'equipar item desbloqueado é gratuito');
  assertEquals(harness.state.progress.selectedItem, 'chapu-pesquisa', 'item desbloqueado equipado');
});

Deno.test('níveis avançam a cada 200 XP cumulativos', () => {
  const { app } = createHarness();
  const calculateLevel = app.progression.calculateLevel;

  assertEquals(calculateLevel(0).level, 1, 'nível inicial');
  assertEquals(calculateLevel(199).level, 1, 'XP abaixo do limite');
  assertEquals(calculateLevel(200).level, 2, 'primeira transição');
  assertEquals(calculateLevel(400).level, 3, 'segunda transição');
  assertEquals(calculateLevel(400).xpToNextLevel, 200, 'XP para o nível seguinte');
});
