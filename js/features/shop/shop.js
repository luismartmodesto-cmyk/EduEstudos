(function () {
  const storage = typeof window !== 'undefined' && window.eduEstudos ? window.eduEstudos.storage : globalThis.eduEstudosStorage;

  if (!storage) {
    return;
  }

  let initialized = false;

  const SHOP_ITEMS = [
    {
      id: 'mochila-aventureira',
      name: 'Mochila aventureira',
      price: 30,
      rarity: 'Comum',
      description: 'Acessório provisório para a jornada.',
    },
    {
      id: 'chapu-pesquisa',
      name: 'Chapéu de pesquisa',
      price: 70,
      rarity: 'Especial',
      description: 'Um item para marcar a próxima fase.',
    },
    {
      id: 'lanterna-constelacao',
      name: 'Lanterna de constelação',
      price: 120,
      rarity: 'Raro',
      description: 'Uma peça especial, clara e provisória.',
    },
  ];

  function getState() {
    const snapshot = storage.getSharedState ? storage.getSharedState() : storage.readStoredState();
    if (!snapshot.progress || typeof snapshot.progress !== 'object') {
      snapshot.progress = storage.createDefaultProgressState();
    }

    snapshot.progress = storage.normalizeProgressState(snapshot.progress);
    return snapshot;
  }

  function getAvailableXp(state) {
    const progress = state.progress || storage.createDefaultProgressState();
    return Math.max(0, Number(progress.totalXp || 0) - Number(progress.spentXp || 0));
  }

  function isUnlocked(state, itemId) {
    const inventory = Array.isArray(state.progress.inventory) ? state.progress.inventory : [];
    return inventory.includes(itemId);
  }

  function setFeedback(message, tone = 'info') {
    const feedback = document.getElementById('shop-feedback');
    if (!feedback) {
      return;
    }

    feedback.textContent = message;
    feedback.dataset.tone = tone;
  }

  function saveState(state) {
    try {
      storage.saveStoredState(state);
      return true;
    } catch (error) {
      console.error('Não foi possível guardar a compra ou seleção da loja.', error);
      render();
      setFeedback('Não foi possível salvar. Verifique o armazenamento e tente novamente.', 'error');
      window.eduEstudos?.progression?.render?.();
      return false;
    }
  }

  function render() {
    const state = getState();
    const shopGrid = document.getElementById('shop-grid');
    if (!shopGrid) {
      return;
    }

    const availableXp = getAvailableXp(state);
    shopGrid.innerHTML = '';

    SHOP_ITEMS.forEach((item) => {
      const card = document.createElement('article');
      card.className = 'shop-item';
      const unlocked = isUnlocked(state, item.id);
      const selected = state.progress.selectedItem === item.id;

      const buttonLabel = selected ? 'Em uso' : unlocked ? 'Equipar' : `Comprar por ${item.price} XP`;
      const buttonClass = unlocked ? 'shop-item__button shop-item__button--secondary' : 'shop-item__button';
      const buttonDisabled = !unlocked && availableXp < item.price;

      card.innerHTML = `
        <div class="shop-item__meta">
          <span class="shop-item__rarity">${item.rarity}</span>
          <strong>${item.name}</strong>
        </div>
        <p>${item.description}</p>
        <div class="shop-item__footer">
          <button type="button" class="${buttonClass}" data-item="${item.id}" ${buttonDisabled || selected ? 'disabled' : ''}>
            ${buttonLabel}
          </button>
        </div>
      `;

      shopGrid.appendChild(card);
    });

    const balance = document.getElementById('shop-balance');
    if (balance) {
      balance.textContent = `${availableXp} XP disponíveis`;
    }

    const feedback = document.getElementById('shop-feedback');
    if (feedback && !feedback.textContent) {
      feedback.dataset.tone = 'info';
    }
  }

  function purchaseItem(itemId) {
    const state = getState();
    const item = SHOP_ITEMS.find((entry) => entry.id === itemId);

    if (!item) {
      setFeedback('Este item não está disponível na loja.', 'error');
      return false;
    }

    const progress = state.progress || storage.createDefaultProgressState();
    const availableXp = Math.max(0, Number(progress.totalXp || 0) - Number(progress.spentXp || 0));

    if (isUnlocked(state, item.id)) {
      if (progress.selectedItem === item.id) {
        return true;
      }

      progress.selectedItem = item.id;
      state.progress = storage.normalizeProgressState(progress);
      if (!saveState(state)) return false;
      render();
      setFeedback(`${item.name} equipado sem custo.`, 'success');
      if (window.eduEstudos?.progression?.render) {
        window.eduEstudos.progression.render();
      }
      return true;
    }

    if (availableXp < item.price) {
      setFeedback(`XP insuficiente. São necessários ${item.price} XP; você tem ${availableXp} XP disponíveis.`, 'error');
      return false;
    }

    progress.spentXp = Number(progress.spentXp || 0) + item.price;
    progress.inventory = Array.isArray(progress.inventory) ? progress.inventory : [];
    if (!progress.inventory.includes(item.id)) {
      progress.inventory.push(item.id);
    }
    progress.selectedItem = item.id;
    state.progress = storage.normalizeProgressState(progress);
    if (!saveState(state)) return false;
    render();
    setFeedback(`${item.name} comprado e equipado.`, 'success');
    if (window.eduEstudos?.progression?.render) {
      window.eduEstudos.progression.render();
    }
    return true;
  }

  function bindEvents() {
    const grid = document.getElementById('shop-grid');
    if (!grid) {
      return;
    }

    grid.addEventListener('click', (event) => {
      const button = event.target.closest('[data-item]');
      if (!button) {
        return;
      }

      purchaseItem(button.dataset.item);
    });
  }

  function init() {
    if (initialized) {
      return;
    }

    initialized = true;
    render();
    bindEvents();
  }

  if (typeof window !== 'undefined') {
    window.eduEstudos = window.eduEstudos || {};
    window.eduEstudos.shop = {
      init,
      render,
      purchaseItem,
      getState: () => getState(),
      getItems: () => SHOP_ITEMS.map((item) => ({ ...item })),
    };
  }

})();
