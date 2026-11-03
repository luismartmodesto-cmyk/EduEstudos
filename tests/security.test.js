import { runInNewContext } from 'node:vm';

const [storageSource, tasksSource, privacySource, appSource] = await Promise.all([
  Deno.readTextFile(new URL('../js/core/storage.js', import.meta.url)),
  Deno.readTextFile(new URL('../js/features/tasks/tasks.js', import.meta.url)),
  Deno.readTextFile(new URL('../js/ui/privacy-notice.js', import.meta.url)),
  Deno.readTextFile(new URL('../js/app.js', import.meta.url)),
]);

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: esperado ${expected}, recebido ${actual}`);
  }
}

function createDocument() {
  const elements = new Map();

  class Element {
    constructor() {
      this.hidden = false;
      this.open = false;
      this.listeners = new Map();
      this.dataset = {};
      this.children = [];
      this.textContent = '';
      this.innerHTML = '';
    }

    addEventListener(type, callback) {
      this.listeners.set(type, callback);
    }

    appendChild(child) {
      this.children.push(child);
      return child;
    }

    showModal() {
      this.open = true;
    }

    close() {
      this.open = false;
    }

    setAttribute() {
      this.open = true;
    }

    removeAttribute() {
      this.open = false;
    }
  }

  return {
    elements,
    document: {
      getElementById(id) {
        if (!elements.has(id)) {
          elements.set(id, new Element());
        }
        return elements.get(id);
      },
      createElement() {
        return new Element();
      },
    },
  };
}

Deno.test('conteúdo e IDs adulterados de tarefas são renderizados sem HTML executável', () => {
  const maliciousId = '" onpointerover="alert(1)"';
  const rawState = JSON.stringify({
    tasks: [{
      id: maliciousId,
      title: '<img src=x onerror=alert(1)>',
      details: '<script>alert(1)</script>',
      category: 'estudo',
      priority: 'media',
    }],
  });
  const localStorage = {
    getItem: () => rawState,
    setItem() {},
  };
  const { document } = createDocument();
  const window = {};

  runInNewContext(storageSource, { window, localStorage, Date, console });
  runInNewContext(tasksSource, { window, document, Date });
  window.eduEstudos.tasks.init();

  const markup = document.getElementById('task-list').children[0].innerHTML;
  assertEquals(markup.includes('data-id="&quot; onpointerover=&quot;alert(1)&quot;"'), true, 'ID em atributo escapado');
  assertEquals(markup.includes('<img'), false, 'título não cria elemento HTML');
  assertEquals(markup.includes('<script'), false, 'detalhes não criam script');
  assertEquals(markup.includes('&lt;img src=x onerror=alert(1)&gt;'), true, 'título permanece texto');
  assertEquals(markup.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), true, 'detalhes permanecem texto');
});

Deno.test('dados locais ilegíveis ficam intactos até reposição confirmada', () => {
  let rawValue = '{json inválido';
  let writes = 0;
  const localStorage = {
    getItem: () => rawValue,
    setItem: (_key, value) => {
      writes++;
      rawValue = value;
    },
  };
  const { document, elements } = createDocument();
  let reloadCount = 0;
  const window = { location: { reload: () => reloadCount++ } };
  const testConsole = { warn() {}, error() {} };

  runInNewContext(storageSource, { window, document, localStorage, Date, console: testConsole });
  const storage = window.eduEstudos.storage;
  const state = storage.getSharedState();
  assertEquals(storage.hasLoadError(), true, 'falha de leitura identificada');

  let saveError = '';
  try {
    storage.saveStoredState(state);
  } catch (error) {
    saveError = error.message;
  }
  assertEquals(saveError.includes('Confirme a reposição'), true, 'gravação bloqueada com mensagem explícita');
  assertEquals(writes, 0, 'falha de leitura não substitui os dados');

  document.getElementById('storage-error').hidden = true;
  runInNewContext(privacySource, { window, document });
  window.eduEstudos.privacyNotice.init();
  assertEquals(elements.get('storage-error').hidden, false, 'aviso de recuperação apresentado');
  assertEquals(elements.has('privacy-dialog'), false, 'aviso normal não é aberto sobre o erro de armazenamento');

  elements.get('storage-error-reset').listeners.get('click')();
  assertEquals(elements.get('reset-dialog').open, true, 'opções exigem diálogo de confirmação');
  elements.get('reset-dialog-cancel').listeners.get('click')();
  assertEquals(elements.get('reset-dialog').open, false, 'cancelamento fecha a confirmação');
  assertEquals(rawValue, '{json inválido', 'cancelar mantém os dados originais');
  assertEquals(writes, 0, 'cancelar não grava');

  elements.get('storage-error-reset').listeners.get('click')();
  elements.get('reset-dialog-confirm').listeners.get('click')();
  assertEquals(storage.hasLoadError(), false, 'reposição confirmada limpa o erro');
  assertEquals(storage.getSharedState().tasks.length, 0, 'reposição restaura tarefas vazias');
  assertEquals(JSON.parse(rawValue).privacyNoticeSeen, false, 'estado inicial gravado');
  assertEquals(writes, 1, 'reposição é gravada uma vez');
  assertEquals(reloadCount, 1, 'aplicativo reiniciado após reposição');
});

Deno.test('a inicialização da aplicação pausa as funcionalidades quando os dados são ilegíveis', () => {
  const localStorage = { getItem: () => '{json inválido', setItem() {} };
  const window = {};
  const calls = { privacy: 0, feature: 0 };
  const document = { readyState: 'complete' };

  runInNewContext(storageSource, { window, localStorage, Date, console: { warn() {}, error() {} } });
  window.eduEstudos.tasks = { init: () => calls.feature++ };
  window.eduEstudos.focus = { init: () => calls.feature++ };
  window.eduEstudos.privacyNotice = { init: () => calls.privacy++ };
  window.eduEstudos.storage.getSharedState();

  runInNewContext(appSource, { window, document });
  assertEquals(calls.privacy, 1, 'fluxo de recuperação inicializado');
  assertEquals(calls.feature, 0, 'funções normais permanecem pausadas');
});

Deno.test('falha de persistência de tarefa mostra erro e não mantém a tarefa em memória', () => {
  const data = new Map();
  let failWrites = false;
  const localStorage = {
    getItem: (key) => data.get(key) || null,
    setItem: (key, value) => {
      if (failWrites) throw new Error('quota exceeded');
      data.set(key, value);
    },
  };
  const { document } = createDocument();
  const window = {};

  runInNewContext(storageSource, {
    window,
    document,
    localStorage,
    Date,
    console: { warn() {}, error() {} },
  });
  runInNewContext(tasksSource, { window, document, Date, console: { error() {} } });
  window.eduEstudos.tasks.init();
  failWrites = true;

  let threw = false;
  try {
    window.eduEstudos.tasks.addTask({ title: 'Tarefa não persistida' });
  } catch {
    threw = true;
  }

  assertEquals(threw, true, 'API não indica sucesso quando a gravação falha');
  assertEquals(window.eduEstudos.tasks.getTasks().length, 0, 'tarefa revertida após falha');
  assertEquals(document.getElementById('task-feedback').dataset.tone, 'error', 'interface mostra erro');
});
