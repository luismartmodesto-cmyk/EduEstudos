import { runInNewContext } from 'node:vm';

const [storageSource, shopSource] = await Promise.all([
  Deno.readTextFile(new URL('../js/core/storage.js', import.meta.url)),
  Deno.readTextFile(new URL('../js/features/shop/shop.js', import.meta.url)),
]);

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: esperado ${expected}, recebido ${actual}`);
  }
}

function createShopApp(localStorage, totalXp = 0) {
  const elements = new Map();
  const stateStorage = {
    getItem: (key) => localStorage.getItem(key),
    setItem: (key, value) => localStorage.setItem(key, value),
  };
  const window = { eduEstudos: { progression: { render() {} } } };
  const document = {
    getElementById(id) {
      if (!elements.has(id)) {
        const element = {
          id,
          textContent: '',
          innerHTML: '',
          dataset: {},
          children: [],
          listeners: new Map(),
          addEventListener(type, callback) {
            this.listeners.set(type, callback);
          },
          appendChild(child) {
            this.children.push(child);
          },
        };
        if (id === 'shop-grid') {
          Object.defineProperty(element, 'innerHTML', {
            get() {
              return this._innerHTML || '';
            },
            set(value) {
              this._innerHTML = value;
              this.children = [];
            },
          });
        }
        elements.set(id, element);
      }

      return elements.get(id);
    },
    createElement() {
      return { dataset: {}, innerHTML: '', className: '' };
    },
  };

  runInNewContext(storageSource, { window, document, localStorage: stateStorage, Date });
  if (totalXp) {
    const state = window.eduEstudos.storage.createDefaultState();
    state.progress.totalXp = totalXp;
    window.eduEstudos.storage.saveStoredState(state);
  }
  runInNewContext(shopSource, { window, document });
  window.eduEstudos.shop.init();

  return { app: window.eduEstudos, elements };
}

Deno.test('loja usa os preços confirmados, persiste compras e permite trocar item sem custo', () => {
  const data = new Map();
  const localStorage = {
    getItem: (key) => data.get(key) || null,
    setItem: (key, value) => data.set(key, value),
  };
  const { app, elements } = createShopApp(localStorage, 300);
  const items = app.shop.getItems();
  assertEquals(items.map((item) => item.price).join(','), '30,70,120', 'preços comuns, especiais e raros');
  const purchaseMarkup = elements.get('shop-grid').children[0].innerHTML;
  assertEquals(purchaseMarkup.includes('Comprar por 30 XP'), true, 'preço aparece dentro do botão verde');
  assertEquals(purchaseMarkup.includes('<span>30 XP</span>'), false, 'preço não aparece fora do botão');

  assertEquals(app.shop.purchaseItem('mochila-aventureira'), true, 'compra comum aceita');
  assertEquals(app.shop.purchaseItem('chapu-pesquisa'), true, 'compra especial aceita');
  assertEquals(app.shop.purchaseItem('lanterna-constelacao'), true, 'compra rara aceita');
  assertEquals(app.shop.purchaseItem('lanterna-constelacao'), true, 'clique repetido não falha');
  assertEquals(app.shop.getState().progress.spentXp, 220, 'cada compra é debitada uma vez');
  assertEquals(app.shop.getState().progress.totalXp - app.shop.getState().progress.spentXp, 80, 'saldo disponível correto');
  assertEquals(app.shop.getState().progress.selectedItem, 'lanterna-constelacao', 'última compra equipada');
  assertEquals(elements.get('shop-balance').textContent, '80 XP disponíveis', 'saldo visível após compras');

  assertEquals(app.shop.purchaseItem('mochila-aventureira'), true, 'troca por item desbloqueado aceita');
  assertEquals(app.shop.getState().progress.selectedItem, 'mochila-aventureira', 'item anterior equipado');
  assertEquals(app.shop.getState().progress.spentXp, 220, 'troca gratuita');

  const reloaded = createShopApp(localStorage);
  assertEquals(reloaded.app.shop.getState().progress.spentXp, 220, 'gastos persistidos após reabrir');
  assertEquals(reloaded.app.shop.getState().progress.inventory.length, 3, 'inventário persistido após reabrir');
  assertEquals(reloaded.app.shop.getState().progress.selectedItem, 'mochila-aventureira', 'equipamento persistido após reabrir');
  const equippedCard = reloaded.elements.get('shop-grid').children
    .find((card) => card.innerHTML.includes('mochila-aventureira'));
  assertEquals(equippedCard.innerHTML.includes('Em uso'), true, 'interface identifica o item equipado');
  assertEquals(equippedCard.innerHTML.includes('disabled'), true, 'item já equipado não oferece ação redundante');
});

Deno.test('saldo insuficiente e item desconhecido não alteram o progresso e explicam o resultado', () => {
  const data = new Map();
  const localStorage = {
    getItem: (key) => data.get(key) || null,
    setItem: (key, value) => data.set(key, value),
  };
  const { app, elements } = createShopApp(localStorage, 29);
  const before = JSON.stringify(app.shop.getState().progress);

  assertEquals(app.shop.purchaseItem('mochila-aventureira'), false, 'compra sem saldo recusada');
  assertEquals(elements.get('shop-feedback').textContent, 'XP insuficiente. São necessários 30 XP; você tem 29 XP disponíveis.', 'mensagem de saldo insuficiente');
  assertEquals(JSON.stringify(app.shop.getState().progress), before, 'compra recusada não altera o estado');

  assertEquals(app.shop.purchaseItem('item-inexistente'), false, 'item desconhecido recusado');
  assertEquals(elements.get('shop-feedback').textContent, 'Este item não está disponível na loja.', 'mensagem para item inválido');
  assertEquals(JSON.stringify(app.shop.getState().progress), before, 'item inválido não altera o estado');
});

Deno.test('falha ao persistir compra não concede item nem mostra sucesso', () => {
  const data = new Map();
  let failWrites = false;
  const localStorage = {
    getItem: (key) => data.get(key) || null,
    setItem: (key, value) => {
      if (failWrites) throw new Error('quota exceeded');
      data.set(key, value);
    },
  };
  const { app, elements } = createShopApp(localStorage, 100);
  failWrites = true;

  assertEquals(app.shop.purchaseItem('mochila-aventureira'), false, 'compra informa falha de persistência');
  assertEquals(app.shop.getState().progress.spentXp, 0, 'XP gasto é revertido');
  assertEquals(app.shop.getState().progress.inventory.length, 0, 'item não é concedido em memória');
  assertEquals(elements.get('shop-feedback').dataset.tone, 'error', 'interface identifica erro');
  assertEquals(elements.get('shop-feedback').textContent.includes('Não foi possível salvar'), true, 'mensagem não aparenta sucesso');
});
