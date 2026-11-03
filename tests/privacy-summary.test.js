import { runInNewContext } from 'node:vm';

const [storageSource, summarySource, privacySource] = await Promise.all([
  Deno.readTextFile(new URL('../js/core/storage.js', import.meta.url)),
  Deno.readTextFile(new URL('../js/features/parent-summary/parent-summary.js', import.meta.url)),
  Deno.readTextFile(new URL('../js/ui/privacy-notice.js', import.meta.url)),
]);

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: esperado ${expected}, recebido ${actual}`);
  }
}

Deno.test('resumo agrega somente progresso local permitido e formata o foco', () => {
  const data = new Map();
  const localStorage = {
    getItem: (key) => data.get(key) || null,
    setItem: (key, value) => data.set(key, value),
  };
  const elements = new Map();
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, { textContent: '' });
      return elements.get(id);
    },
  };
  const window = { eduEstudos: {} };

  runInNewContext(storageSource, { window, document, localStorage, Date });
  const storage = window.eduEstudos.storage;
  const state = storage.getSharedState();
  state.tasks = [
    { id: 'one', title: 'Tarefa fictícia', completed: true },
    { id: 'two', title: 'Outra tarefa', completed: false },
  ];
  state.progress.totalXp = 245;
  state.progress.totalFocusedMs = 3_720_000;
  state.missions.progress['mission-1'].completed = true;
  state.missions.progress['mission-2'].completed = true;
  storage.saveStoredState(state);

  runInNewContext(summarySource, { window, document });
  window.eduEstudos.parentSummary.init();
  const summary = window.eduEstudos.parentSummary.getSummary();
  assertEquals(summary.completedMissions, 2, 'missões concluídas');
  assertEquals(summary.completedTasks, 1, 'tarefas concluídas');
  assertEquals(summary.totalFocusedMs, 3_720_000, 'tempo de foco total');
  assertEquals(summary.totalXp, 245, 'XP local');
  assertEquals(summary.level, 2, 'nível calculado');
  assertEquals(elements.get('summary-focus').textContent, '1 h 2 min', 'tempo de foco formatado');
  assertEquals(elements.get('summary-level').textContent, 'Nível 2 · 245 XP', 'progresso geral apresentado');
});

Deno.test('aviso aparece na primeira utilização, pode ser fechado e reaberto depois', () => {
  const data = new Map();
  const localStorage = {
    getItem: (key) => data.get(key) || null,
    setItem: (key, value) => data.set(key, value),
  };
  const elements = new Map();
  const document = {
    getElementById(id) {
      if (!elements.has(id)) {
        elements.set(id, {
          open: false,
          listeners: new Map(),
          addEventListener(type, callback) {
            this.listeners.set(type, callback);
          },
          showModal() {
            this.open = true;
          },
          close() {
            this.open = false;
          },
          setAttribute() {},
          removeAttribute() {
            this.open = false;
          },
        });
      }
      return elements.get(id);
    },
  };
  const window = { eduEstudos: {} };

  runInNewContext(storageSource, { window, document, localStorage, Date });
  runInNewContext(privacySource, { window, document });
  window.eduEstudos.privacyNotice.init();
  const dialog = elements.get('privacy-dialog');
  assertEquals(dialog.open, true, 'aviso inicial aberto');
  assertEquals(window.eduEstudos.storage.getSharedState().privacyNoticeSeen, false, 'aviso não marcado sem confirmação');

  elements.get('privacy-notice-accept').listeners.get('click')();
  assertEquals(dialog.open, false, 'aviso fecha após confirmação');
  assertEquals(window.eduEstudos.storage.getSharedState().privacyNoticeSeen, true, 'confirmação salva localmente');

  window.eduEstudos.privacyNotice.openNotice();
  assertEquals(dialog.open, true, 'aviso pode ser consultado de novo');
});

Deno.test('reposição completa permite cancelar e, confirmada, restaura o estado inicial', () => {
  const data = new Map();
  const localStorage = {
    getItem: (key) => data.get(key) || null,
    setItem: (key, value) => data.set(key, value),
  };
  const elements = new Map();
  const document = {
    getElementById(id) {
      if (!elements.has(id)) {
        elements.set(id, {
          open: false,
          textContent: '',
          listeners: new Map(),
          addEventListener(type, callback) {
            this.listeners.set(type, callback);
          },
          showModal() {
            this.open = true;
          },
          close() {
            this.open = false;
          },
          setAttribute() {},
          removeAttribute() {
            this.open = false;
          },
        });
      }
      return elements.get(id);
    },
  };
  let reloadCount = 0;
  const window = { eduEstudos: {}, location: { reload: () => reloadCount++ } };

  runInNewContext(storageSource, { window, document, localStorage, Date });
  const storage = window.eduEstudos.storage;
  const state = storage.getSharedState();
  state.tasks = [{ id: 'keep-out', title: 'Apagar esta tarefa', completed: true }];
  state.progress.totalXp = 245;
  state.progress.inventory = ['mochila-aventureira'];
  state.progress.selectedItem = 'mochila-aventureira';
  state.privacyNoticeSeen = true;
  storage.saveStoredState(state);

  runInNewContext(privacySource, { window, document });
  window.eduEstudos.privacyNotice.init();

  elements.get('reset-data').listeners.get('click')();
  const dialog = elements.get('reset-dialog');
  assertEquals(dialog.open, true, 'confirmação de reposição aberta');
  elements.get('reset-dialog-cancel').listeners.get('click')();
  assertEquals(dialog.open, false, 'cancelamento fecha a confirmação');
  assertEquals(storage.getSharedState().tasks.length, 1, 'cancelar preserva as tarefas');
  assertEquals(reloadCount, 0, 'cancelar não reinicia a página');

  window.eduEstudos.privacyNotice.openResetDialog();
  elements.get('reset-dialog-confirm').listeners.get('click')();
  const resetState = storage.getSharedState();
  assertEquals(resetState.tasks.length, 0, 'tarefas removidas');
  assertEquals(resetState.progress.totalXp, 0, 'XP restaurado');
  assertEquals(resetState.progress.inventory.length, 0, 'inventário esvaziado');
  assertEquals(resetState.progress.selectedItem, null, 'nenhum item selecionado');
  assertEquals(resetState.missions.progress['mission-1'].completed, false, 'missões reiniciadas');
  assertEquals(resetState.privacyNoticeSeen, false, 'aviso volta a aparecer no próximo início');
  assertEquals(JSON.parse(data.get(storage.STORAGE_KEY)).tasks.length, 0, 'estado inicial persistido');
  assertEquals(dialog.open, false, 'confirmação fecha após a reposição');
  assertEquals(reloadCount, 1, 'aplicativo reiniciado após a reposição');
});

Deno.test('reposição mostra erro quando o armazenamento bloqueia gravações', () => {
  const localStorage = {
    getItem: () => null,
    setItem() {
      throw new Error('QuotaExceededError');
    },
  };
  const elements = new Map();
  const document = {
    getElementById(id) {
      if (!elements.has(id)) {
        elements.set(id, {
          open: false,
          textContent: '',
          listeners: new Map(),
          addEventListener(type, callback) {
            this.listeners.set(type, callback);
          },
          showModal() {
            this.open = true;
          },
          close() {
            this.open = false;
          },
          setAttribute() {},
          removeAttribute() {
            this.open = false;
          },
        });
      }
      return elements.get(id);
    },
  };
  let reloadCount = 0;
  const window = { eduEstudos: {}, location: { reload: () => reloadCount++ } };

  runInNewContext(storageSource, { window, document, localStorage, Date, console });
  runInNewContext(privacySource, { window, document, console });
  window.eduEstudos.privacyNotice.init();
  window.eduEstudos.privacyNotice.resetData();
  assertEquals(elements.get('reset-feedback').textContent.includes('Não foi possível apagar'), true, 'erro apresentado');
  assertEquals(reloadCount, 0, 'falha não reinicia o aplicativo');
});
