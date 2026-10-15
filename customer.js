/* Customer accounts and server-synced wishlists for the storefront. */
(async () => {
  'use strict';

  const Store = window.Store;
  if (!Store) return;
  await Store.api.productsReady;

  let account = null;
  let wishlist = new Set();
  let accountModal;
  let wishlistModal;
  let mode = 'login';

  const escapeHtml = Store.escapeHtml;
  const showMessage = text => {
    let toast = document.querySelector('#store-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'store-toast';
      toast.className = 'store-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = text;
    toast.classList.add('show');
    window.clearTimeout(showMessage.timer);
    showMessage.timer = window.setTimeout(() => toast.classList.remove('show'), 2400);
  };
  const api = async (url, options = {}) => {
    const response = await fetch(url, {
      credentials: 'same-origin',
      ...options,
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Could not reach your account. Please try again.');
    return data;
  };

  const icon = name => name === 'heart'
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 8.6c0 5.4-8.8 11-8.8 11s-8.8-5.6-8.8-11A4.6 4.6 0 0 1 12 6a4.6 4.6 0 0 1 8.8 2.6Z"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7.5" r="3.5"/><path d="M4.5 21v-2.2a7.5 7.5 0 0 1 15 0V21"/></svg>';

  function paintWishlistButtons() {
    document.querySelectorAll('[data-wishlist-product]').forEach(button => {
      const saved = wishlist.has(Number(button.dataset.wishlistProduct));
      button.classList.toggle('is-saved', saved);
      button.setAttribute('aria-pressed', String(saved));
      button.setAttribute('aria-label', saved ? 'Remove from wishlist' : 'Add to wishlist');
      button.title = saved ? 'Remove from wishlist' : 'Add to wishlist';
    });
    const count = document.querySelector('[data-header-wishlist-count]');
    if (count) {
      const nextCount = String(wishlist.size);
      if (count.textContent !== nextCount) count.textContent = nextCount;
      const isHidden = wishlist.size === 0;
      if (count.hidden !== isHidden) count.hidden = isHidden;
    }
  }

  function decorateProductHearts() {
    document.querySelectorAll('.product-card').forEach(card => {
      const link = card.querySelector('.product-link');
      const host = card.querySelector('.product-image');
      if (!link || !host || host.querySelector('[data-wishlist-product]')) return;
      const index = Number(new URL(link.href, location.href).searchParams.get('product'));
      if (!Number.isInteger(index)) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'product-wishlist';
      button.dataset.wishlistProduct = String(index);
      button.innerHTML = icon('heart');
      host.appendChild(button);
    });

    const detailTitle = document.querySelector('#detail-name');
    const detailIndex = Number(new URLSearchParams(location.search).get('product')) || 0;
    if (detailTitle && !detailTitle.parentElement.querySelector('[data-wishlist-product]')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'product-wishlist detail-wishlist';
      button.dataset.wishlistProduct = String(detailIndex);
      button.innerHTML = icon('heart');
      detailTitle.insertAdjacentElement('afterend', button);
    }
    paintWishlistButtons();
  }

  function installHeader() {
    const actions = document.querySelector('.header-actions');
    if (!actions || actions.querySelector('[data-customer-account]')) return;

    const accountButton = document.createElement('button');
    accountButton.type = 'button';
    accountButton.className = 'header-icon-button';
    accountButton.dataset.customerAccount = '';
    accountButton.setAttribute('aria-label', 'Sign in or create account');
    accountButton.title = 'Sign in or create account';
    accountButton.innerHTML = icon('account');
    accountButton.addEventListener('click', () => showAccount());

    const heartButton = document.createElement('button');
    heartButton.type = 'button';
    heartButton.className = 'header-icon-button header-wishlist-button';
    heartButton.setAttribute('aria-label', 'Open wishlist');
    heartButton.title = 'Open wishlist';
    heartButton.innerHTML = icon('heart') + '<span data-header-wishlist-count hidden></span>';
    heartButton.addEventListener('click', showWishlist);

    const cartButton = actions.querySelector('.cart-trigger');
    actions.insertBefore(heartButton, cartButton || null);
    actions.insertBefore(accountButton, heartButton);
  }

  function updateHeader() {
    const button = document.querySelector('[data-customer-account]');
    if (button) {
      button.classList.toggle('is-signed-in', Boolean(account));
      button.setAttribute('aria-label', account ? 'Your account' : 'Sign in or create account');
      button.title = account ? 'Your account' : 'Sign in or create account';
    }
    paintWishlistButtons();
  }

  function ensureAccountModal() {
    if (accountModal) return accountModal;
    accountModal = document.createElement('div');
    accountModal.className = 'store-modal customer-modal';
    accountModal.id = 'customer-account-modal';
    accountModal.innerHTML = `
      <div class="store-modal-card customer-modal-card" role="dialog" aria-modal="true" aria-labelledby="customer-account-title">
        <button type="button" class="modal-close" data-account-close aria-label="Close">×</button>
        <p class="eyebrow">YOUR ACCOUNT</p>
        <h2 id="customer-account-title">Sign in</h2>
        <form data-customer-auth>
          <label data-auth-name-wrap>Full name<input name="name" autocomplete="name" maxlength="100"></label>
          <label>Email<input name="email" type="email" autocomplete="email" required maxlength="160"></label>
          <label>Password<input name="password" type="password" autocomplete="current-password" required minlength="8" maxlength="128"></label>
          <p class="customer-auth-message" data-auth-message aria-live="polite"></p>
          <button class="button button-dark" type="submit" data-auth-submit>Sign in</button>
        </form>
        <div class="customer-account-profile" data-account-profile hidden>
          <p data-account-email></p>
          <button type="button" class="button" data-account-logout>Sign out</button>
        </div>
        <button type="button" class="customer-auth-switch" data-auth-switch>Create an account</button>
      </div>`;
    document.body.appendChild(accountModal);

    const form = accountModal.querySelector('[data-customer-auth]');
    const nameLabel = accountModal.querySelector('[data-auth-name-wrap]');
    const nameInput = form.elements.name;
    const switchButton = accountModal.querySelector('[data-auth-switch]');
    const setMode = nextMode => {
      mode = nextMode;
      const signup = mode === 'signup';
      accountModal.querySelector('#customer-account-title').textContent = signup ? 'Create account' : 'Sign in';
      accountModal.querySelector('[data-auth-submit]').textContent = signup ? 'Create account' : 'Sign in';
      nameLabel.hidden = !signup;
      nameInput.required = signup;
      form.elements.password.autocomplete = signup ? 'new-password' : 'current-password';
      switchButton.textContent = signup ? 'Already have an account? Sign in' : 'Create an account';
      accountModal.querySelector('[data-auth-message]').textContent = '';
    };
    switchButton.addEventListener('click', () => setMode(mode === 'login' ? 'signup' : 'login'));
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const submit = accountModal.querySelector('[data-auth-submit]');
      const message = accountModal.querySelector('[data-auth-message]');
      submit.disabled = true;
      message.textContent = '';
      try {
        const data = await api('/api/account/' + mode, {
          method: 'POST',
          body: JSON.stringify({ name: form.elements.name.value, email: form.elements.email.value, password: form.elements.password.value })
        });
        account = data.user;
        wishlist = new Set((account.wishlist || []).map(Number));
        accountModal.classList.remove('show');
        updateHeader();
        window.dispatchEvent(new CustomEvent('customer:account-changed'));
      } catch (error) {
        message.textContent = error.message;
      } finally {
        submit.disabled = false;
      }
    });
    accountModal.querySelector('[data-account-logout]').addEventListener('click', async () => {
      try { await api('/api/account/logout', { method: 'POST' }); } catch (error) { /* Clear the local account state too. */ }
      account = null;
      wishlist.clear();
      accountModal.classList.remove('show');
      updateHeader();
      window.dispatchEvent(new CustomEvent('customer:account-changed'));
    });
    accountModal.querySelector('[data-account-close]').addEventListener('click', () => accountModal.classList.remove('show'));
    accountModal.addEventListener('click', event => { if (event.target === accountModal) accountModal.classList.remove('show'); });
    accountModal.setMode = setMode;
    return accountModal;
  }

  function showAccount() {
    const modal = ensureAccountModal();
    const form = modal.querySelector('[data-customer-auth]');
    const profile = modal.querySelector('[data-account-profile]');
    const switchButton = modal.querySelector('[data-auth-switch]');
    if (account) {
      modal.querySelector('#customer-account-title').textContent = 'Your account';
      form.hidden = true;
      profile.hidden = false;
      switchButton.hidden = true;
      modal.querySelector('[data-account-email]').textContent = account.name + ' · ' + account.email;
    } else {
      form.hidden = false;
      profile.hidden = true;
      switchButton.hidden = false;
      modal.setMode('login');
    }
    modal.classList.add('show');
    (account ? modal.querySelector('[data-account-logout]') : form.elements.email).focus();
  }

  function ensureWishlistModal() {
    if (wishlistModal) return wishlistModal;
    wishlistModal = document.createElement('div');
    wishlistModal.className = 'store-modal customer-modal';
    wishlistModal.id = 'customer-wishlist-modal';
    wishlistModal.innerHTML = `
      <div class="store-modal-card customer-wishlist-card" role="dialog" aria-modal="true" aria-labelledby="customer-wishlist-title">
        <button type="button" class="modal-close" data-wishlist-close aria-label="Close">×</button>
        <p class="eyebrow">SAVED FOR LATER</p>
        <h2 id="customer-wishlist-title">Your wishlist</h2>
        <div class="customer-wishlist-items" data-wishlist-items></div>
      </div>`;
    document.body.appendChild(wishlistModal);
    wishlistModal.querySelector('[data-wishlist-close]').addEventListener('click', () => wishlistModal.classList.remove('show'));
    wishlistModal.addEventListener('click', event => { if (event.target === wishlistModal) wishlistModal.classList.remove('show'); });
    wishlistModal.querySelector('[data-wishlist-items]').addEventListener('click', event => {
      const remove = event.target.closest('[data-wishlist-remove]');
      if (remove) toggleWishlist(Number(remove.dataset.wishlistRemove), false);
    });
    return wishlistModal;
  }

  function renderWishlist() {
    const modal = ensureWishlistModal();
    const host = modal.querySelector('[data-wishlist-items]');
    const products = Array.from(wishlist).map(index => ({ product: Store.state.products[index], index })).filter(entry => entry.product);
    host.innerHTML = products.map(({ product, index }) => `
      <div class="customer-wishlist-item">
        <img src="${Store.escapeAttr(product.image)}" alt="">
        <a href="product.html?product=${index}">${escapeHtml(product.name)}</a>
        <button type="button" data-wishlist-remove="${index}" aria-label="Remove ${escapeHtml(product.name)} from wishlist" title="Remove from wishlist">×</button>
      </div>`).join('') || '<p class="muted">Your wishlist is empty.</p>';
    return modal;
  }

  function showWishlist() {
    if (!account) {
      showAccount();
      return;
    }
    renderWishlist().classList.add('show');
  }

  async function toggleWishlist(productIndex, saved = !wishlist.has(productIndex)) {
    if (!account) {
      showAccount();
      return;
    }
    try {
      const data = await api('/api/account/wishlist', {
        method: 'PUT',
        body: JSON.stringify({ productIndex, saved })
      });
      wishlist = new Set((data.wishlist || []).map(Number));
      updateHeader();
      if (wishlistModal) renderWishlist();
    } catch (error) {
      if (/sign in/i.test(error.message)) showAccount();
      else showMessage(error.message);
    }
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-wishlist-product]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    toggleWishlist(Number(button.dataset.wishlistProduct));
  });

  async function loadAccount() {
    try {
      const data = await api('/api/account/session');
      account = data.signedIn ? data.user : null;
      wishlist = new Set((account && account.wishlist || []).map(Number));
    } catch (error) {
      account = null;
      wishlist.clear();
    }
    updateHeader();
  }

  installHeader();
  decorateProductHearts();
  new MutationObserver(decorateProductHearts).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('store:products-loaded', decorateProductHearts);
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      accountModal?.classList.remove('show');
      wishlistModal?.classList.remove('show');
    }
  });
  await loadAccount();
})();