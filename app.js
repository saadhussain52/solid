/*
 * Solids storefront behaviour.
 * Reads every product, size, price, image and text from the shared store
 * (store-data.js) so anything changed in the admin workspace appears here.
 */
(async () => {
  'use strict';

  const Store = window.Store;
  if (!Store) return;
  await Store.api.productsReady;

  const { money, slugify, escapeHtml, escapeAttr } = Store;
  const grid = document.querySelector('#product-grid');
  const collectionGrid = document.querySelector('#collection-grid');
  let cart = [];
  let wishlist = new Set();
  try { cart = JSON.parse(localStorage.getItem('solids-cart') || '[]') || []; } catch (error) { cart = []; }

  const saveCart = () => {
    try { localStorage.setItem('solids-cart', JSON.stringify(cart)); } catch (error) { /* ignore */ }
  };

  const productLabel = product => Store.categoryName(product.category);
  const wishlistButton = index => `<button type="button" class="product-wishlist${wishlist.has(index) ? ' is-saved' : ''}" data-wishlist-product="${index}" aria-label="${wishlist.has(index) ? 'Remove from' : 'Add to'} wishlist" aria-pressed="${wishlist.has(index)}" title="${wishlist.has(index) ? 'Remove from' : 'Add to'} wishlist"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 8.6c0 5.4-8.8 11-8.8 11s-8.8-5.6-8.8-11A4.6 4.6 0 0 1 12 6a4.6 4.6 0 0 1 8.8 2.6Z"/></svg></button>`;
  window.addEventListener('store:products-loaded', () => renderProducts(currentFilter));

  /* ------------------------------------------------------- site content */

  const applyContent = () => {
    const content = Store.state.content;
    const set = (selector, value) => {
      const element = document.querySelector(selector);
      if (element && value != null) element.textContent = value;
    };
    set('.announcement', content.announcement);
    set('.hero-copy .eyebrow', content.heroEyebrow);
    set('.hero-copy h1', content.heroTitle);
    set('.hero-copy > p:not(.eyebrow)', content.heroSubline);
    set('#collections .section-heading .eyebrow', content.collectionsEyebrow);
    set('#collections .section-heading h2', content.collectionsTitle);
    set('#collections .section-note', content.collectionsNote);
    set('#shop .section-heading .eyebrow', content.arrivalsEyebrow);
    set('#shop .section-heading h2', content.arrivalsTitle);
    set('.manifesto .eyebrow', content.manifestoEyebrow);
    set('.manifesto h2', content.manifestoTitle);
    set('.manifesto > p:last-child', content.manifestoBody);
    set('.footer-brand p', content.footerTagline);

    const cta = document.querySelector('.hero-copy .button');
    if (cta && content.heroCta) cta.childNodes[0].nodeValue = content.heroCta + ' ';

    if (content.heroImage) {
      const heroImage = document.querySelector('.hero > img');
      if (heroImage) heroImage.src = content.heroImage;
    }
  };

  /* ---------------------------------------------------------- collection */

  const collectionImage = collection => (collection && collection.image) || Store.IMAGE.fallback;

  /* Another tab (usually the admin panel) changed the stored collections.
   The storage event only fires in *other* tabs, which is exactly what we
   want here, and it does not refresh Store.state — so re-read the key and
   rebuild the menu. A collection added in the admin panel then appears in
   this menu without touching the page. */
  window.addEventListener('storage', event => {
    if (event.key !== Store.KEYS.collections) return;
    const menu = document.querySelector('.nav-dropdown-menu');
    if (!menu) return;
    Store.state.collections = Store.read(Store.KEYS.collections, Store.state.collections);
    menu.innerHTML = Store.state.collections.map(collection => `
        <a href="all.html?category=${slugify(collection.name)}">${escapeHtml(collection.name)}</a>`).join('');
  });

  /* --------------------------------------------- collections nav dropdown */

  const setupCollectionsDropdown = () => {
    const wrap = document.querySelector('.nav-dropdown');
    const trigger = wrap?.querySelector('a');
    const menu = wrap?.querySelector('.nav-dropdown-menu');
    if (!wrap || !trigger || !menu) return;

    /* On phones the nav is a horizontally scrollable strip (overflow-x:auto),
       and that clipping hides the absolutely positioned menu — the menu opens
       but renders nothing. Dropping the clip for as long as it is open fixes
       that without giving up the scrollable strip when it is closed. */
    const strip = wrap.closest('.desktop-nav');
    let openedByHover = false;
    const close = () => {
      wrap.classList.remove('open');
      strip?.classList.remove('nav-open');
      trigger.setAttribute('aria-expanded', 'false');
      openedByHover = false;
    };
    const open = () => {
      wrap.classList.add('open');
      strip?.classList.add('nav-open');
      trigger.setAttribute('aria-expanded', 'true');
    };

    /* Only the real collections — no "Shop all" filler. Anything added in the
       admin panel lands here automatically on the next page load. */
    menu.innerHTML = Store.state.collections.map(collection => `
        <a href="all.html?category=${slugify(collection.name)}">${escapeHtml(collection.name)}</a>`).join('');

    trigger.addEventListener('click', event => {
      event.preventDefault();
      /* Hover already reveals the menu (and moving the pointer here fires
         mouseenter first), so a click must NOT slam it shut again — that
         would make the menu feel broken. Touch devices have no hover,
         so there the click is the only way in. */
      if (openedByHover) return;
      wrap.classList.contains('open') ? close() : open();
    });
    wrap.addEventListener('mouseenter', () => {
      if (matchMedia('(hover:hover)').matches) {
        openedByHover = true;
        open();
      }
    });
    wrap.addEventListener('mouseleave', () => {
      if (openedByHover) close();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') close();
    });
    document.addEventListener('click', event => {
      if (!wrap.contains(event.target)) close();
    });
  };

  const renderCollections = () => {
    if (!collectionGrid) return;
    const list = Store.state.collections;
    if (!list.length) { collectionGrid.innerHTML = '<p class="muted">No collections yet.</p>'; return; }
    collectionGrid.innerHTML = list.map((collection, index) => `
      <a class="collection-card${index === 0 ? ' collection-tall' : ''}" href="all.html?category=${slugify(collection.name)}">
        <img src="${escapeHtml(collectionImage(collection))}" alt="${escapeHtml(collection.name)}" loading="lazy" decoding="async">
        <div class="collection-label">
          <span>${String(index + 1).padStart(2, '0')}</span>
          <strong>${escapeHtml(collection.name).toUpperCase()}</strong>
          <em>Shop now &#8599;</em>
        </div>
      </a>`).join('');
  };

  /* ------------------------------------------------------------- filters */

  const syncFilterButtons = () => {
    const row = document.querySelector('.filter-row, .catalog-sidebar');
    if (!row) return;
    const isSidebar = row.classList.contains('catalog-sidebar');
    row.querySelectorAll('[data-managed-filter]').forEach(button => button.remove());
    /* CATEGORIES label stays pinned to the top of the sidebar */
    Store.state.categories.forEach(category => {
      if (category === 'New Arrivals') return;
      const slug = slugify(category);
      if (row.querySelector(`[data-filter="${slug}"]`)) return;
      const button = document.createElement('button');
      button.className = isSidebar ? 'catalog-filter' : 'filter';
      button.dataset.filter = slug;
      button.dataset.managedFilter = 'true';
      button.textContent = category;
      row.appendChild(button);
    });
    if (!row.querySelector('[data-filter="new-arrivals"]')) {
      const button = document.createElement('button');
      button.className = isSidebar ? 'catalog-filter' : 'filter';
      button.dataset.filter = 'new-arrivals';
      button.dataset.managedFilter = 'true';
      button.textContent = 'New Arrivals';
      const allButton = row.querySelector('[data-filter="all"]');
      if (allButton) row.insertBefore(button, allButton.nextSibling);
      else row.appendChild(button);
    }
    if (isSidebar) {
      const label = row.querySelector('.eyebrow');
      if (label) row.insertBefore(label, row.firstChild);
    }
  };

  const setActiveFilter = slug => {
    document.querySelectorAll('.filter, .catalog-filter').forEach(button => {
      button.classList.toggle('active', (button.dataset.filter || 'all') === slug);
    });
  };

  const matches = (product, filter) => {
    if (!filter || filter === 'all') return true;
    if (filter === 'new-arrivals') return product.tag === 'New';
    return product.category === slugify(filter);
  };

  /* --------------------------------------------------------- product grid */

  function renderProducts(filter = 'all') {
    if (!grid) return;
    const list = Store.state.products.filter(product => matches(product, filter));
    if (!list.length) {
      grid.innerHTML = '<p class="muted">No products in this collection yet.</p>';
    } else {
      grid.innerHTML = list.map(product => {
        const index = Store.state.products.indexOf(product);
        const status = Store.productStatus(product);
        const units = Store.totalStock(product);
        const low = units > 0 && units <= 5;
        return `<article class="product-card${status.key === 'sold-out' ? ' is-sold-out' : ''}">
          <div class="product-image">
            <a class="product-link" href="product.html?product=${index}" aria-label="View ${escapeHtml(product.name)}">
              <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy" decoding="async">
            </a>
            ${wishlistButton(index)}
            ${product.tag ? `<span class="product-badge">${escapeHtml(product.tag)}</span>` : ''}
            ${status.key === 'sold-out' ? '<span class="sold-out-flag">Sold Out</span>' : ''}
            ${low ? `<span class="low-stock-flag">Only ${units} left</span>` : ''}
            <button class="quick-add" data-product="${index}"${status.key === 'sold-out' ? ' disabled' : ''}>
              ${status.key === 'sold-out' ? 'SOLD OUT' : 'Add to bag <span>+</span>'}
            </button>
          </div>
          <div class="product-details">
            <div>
              <h3><a href="product.html?product=${index}">${escapeHtml(product.name)}</a></h3>
              <p>Solids / ${escapeHtml(productLabel(product))}${low ? ` · ${units} left` : ''}</p>
            </div>
            <span class="product-price">${Store.priceRangeMarkup(product)}</span>
          </div>
        </article>`;
      }).join('');
    }
    grid.querySelectorAll('.quick-add').forEach(button => button.addEventListener('click', () => {
      window.location.href = `product.html?product=${Number(button.dataset.product)}`;
    }));
    updateProductCount(filter);
  }

  const updateProductCount = filter => {
    const label = document.querySelector('#product-count');
    if (label) label.textContent = `${Store.state.products.filter(product => matches(product, filter)).length} products`;
  };

  /* --------------------------------------------------------------- cart */

  /* A bag line is a product in a size in a colour — the same shirt in Bone and in
     Black are two different things to pick, pack and ship, so the colour is part
     of the key rather than a label that gets overwritten. */
  const cartKey = item => JSON.stringify([item.productIndex, item.size || '', item.color || '', item.options || {}]);
  const optionSummary = options => Object.entries(options || {}).map(([label, value]) => `${label}: ${value}`).join(' · ');
  const stockForCartLine = (product, line) => product.fitOptionsEnabled
    ? (Store.fitVariantFor(product, line.color, line.options)?.stock || 0)
    : (line.size ? Store.stockFor(product, line.size, line.color) : Store.totalStock(product));

  function addToCart(item) {
    const product = Store.state.products[item.productIndex];
    if (!product) return;
    const requestedQuantity = Math.max(1, Math.floor(Number(item.quantity) || 1));
    if (product.fitOptionsEnabled) {
      if (!Store.fitVariantFor(product, item.color, item.options)) {
        notify('Choose every required option before adding this product');
        return;
      }
      if (Store.fitVariantFor(product, item.color, item.options).stock <= 0) { notify('That colour and option combination is sold out'); return; }
    } else if (item.size) {
      if (Store.stockFor(product, item.size, item.color) <= 0) { notify(`${product.name} — ${item.color || ''} ${item.size} is sold out`); return; }
    } else if (Store.totalStock(product) <= 0) {
      notify(`${product.name} is sold out`);
      return;
    }
    const key = cartKey(item);
    const existing = cart.filter(line => cartKey(line) === key)[0];
    const inBag = existing ? existing.quantity : 0;
    const available = product.fitOptionsEnabled
      ? Store.fitVariantFor(product, item.color, item.options).stock
      : (item.size ? Store.stockFor(product, item.size, item.color) : Store.totalStock(product));
    if (inBag + requestedQuantity > available) {
      notify(`Only ${Math.max(0, available - inBag)} more available in ${item.color ? item.color + ' ' : ''}${item.size || product.name}`);
      return;
    }
    if (existing) existing.quantity += requestedQuantity;
    else cart.push({ productIndex: item.productIndex, size: item.size || '', color: item.color || '', options: item.options || {}, quantity: requestedQuantity });
    saveCart();
    updateCart();
    openDrawer('cart-drawer');
  }

  function cartLines() {
    return cart.map(line => {
      const product = Store.state.products[line.productIndex];
      if (!product) return null;
      const price = !product.fitOptionsEnabled && line.size ? Store.priceFor(product, line.size, line.color) : numOr(product.price);
      const colorImage = product.colorImages && product.colorImages[line.color];
      const image = Array.isArray(colorImage)
        ? (colorImage.find(Boolean) || product.image)
        : (typeof colorImage === 'string' && colorImage ? colorImage : product.image);
      return { line, product, price, total: price * line.quantity, image };
    }).filter(Boolean);
  }

  const numOr = value => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  function updateCart() {
    const lines = cartLines();
    const count = lines.reduce((sum, entry) => sum + entry.line.quantity, 0);
    const total = lines.reduce((sum, entry) => sum + entry.total, 0);
    const countEl = document.querySelector('#cart-count');
    const drawerCount = document.querySelector('#drawer-count');
    const totalEl = document.querySelector('#cart-total');
    if (countEl) countEl.textContent = count;
    if (drawerCount) drawerCount.textContent = count;
    if (totalEl) totalEl.textContent = money(total);

    const items = document.querySelector('#cart-items');
    if (!items) return;
    const checkout = document.querySelector('.checkout-button');
    if (!lines.length) {
      items.innerHTML = '<p class="empty-state">Your bag is currently empty.</p>';
      if (checkout) { checkout.disabled = true; checkout.classList.add('is-disabled'); }
      return;
    }
    if (checkout) { checkout.disabled = false; checkout.classList.remove('is-disabled'); }
    items.innerHTML = lines.map((entry, index) => `
      <div class="cart-item">
        <img src="${escapeHtml(entry.image)}" alt="${escapeHtml(entry.product.name)}${entry.line.color ? ' in ' + escapeHtml(entry.line.color) : ''}">
        <div>
          <h4>${escapeHtml(entry.product.name)}</h4>
          <p>${entry.product.sku ? `SKU ${escapeHtml(entry.product.sku)} · ` : ''}${entry.line.color ? `${escapeHtml(entry.line.color)} · ` : `<a href="product.html?product=${entry.line.productIndex}">Choose colour</a> · `}${entry.product.fitOptionsEnabled ? `${escapeHtml(optionSummary(entry.line.options))} · ` : entry.line.size ? `Size ${escapeHtml(entry.line.size)} · ` : ''}${money(entry.price)} × ${entry.line.quantity}</p>
          <div class="cart-quantity">
            <button data-cart-dec="${index}" aria-label="Decrease quantity">−</button>
            <span>${entry.line.quantity}</span>
            <button data-cart-inc="${index}" aria-label="Increase quantity">+</button>
          </div>
          <button class="remove-item" data-remove="${index}">Remove</button>
        </div>
      </div>`).join('');

    items.querySelectorAll('[data-remove]').forEach(button => button.addEventListener('click', () => {
      cart.splice(Number(button.dataset.remove), 1);
      saveCart();
      updateCart();
    }));
    items.querySelectorAll('[data-cart-dec]').forEach(button => button.addEventListener('click', () => {
      const index = Number(button.dataset.cartDec);
      if (cart[index].quantity > 1) cart[index].quantity -= 1;
      else cart.splice(index, 1);
      saveCart();
      updateCart();
    }));
    items.querySelectorAll('[data-cart-inc]').forEach(button => button.addEventListener('click', () => {
      const index = Number(button.dataset.cartInc);
      const line = cart[index];
      const product = Store.state.products[line.productIndex];
      const available = stockForCartLine(product, line);
      if (line.quantity >= available) { notify(`Only ${available} available`); return; }
      line.quantity += 1;
      saveCart();
      updateCart();
    }));
  }

  const notify = message => {
    let toast = document.querySelector('#store-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'store-toast';
      toast.className = 'store-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    window.clearTimeout(notify.timer);
    notify.timer = window.setTimeout(() => toast.classList.remove('show'), 2400);
  };

  /* ----------------------------------------------------------- drawers */

  function openDrawer(id) {
    const panel = document.querySelector(`#${id}`);
    panel?.classList.add('open');
    document.querySelector('.scrim')?.classList.add('show');
    /* Focus the search field so the panel is immediately usable — without
       this the mobile keyboard never appears and the visitor has to tap
       the input a second time before they can type. */
    if (id === 'search-panel') {
      const input = panel?.querySelector('#search-input');
      if (input) {
        input.focus();
        if (input.setSelectionRange) input.setSelectionRange(input.value.length, input.value.length);
      }
    }
  }
  const closeDrawers = () => {
    document.querySelectorAll('.search-panel,.cart-drawer').forEach(el => el.classList.remove('open'));
    document.querySelector('.scrim')?.classList.remove('show');
    /* Clear the query and old hits: reopening search should start fresh,
       not append to a leftover term that matches nothing. */
    const input = document.querySelector('#search-input');
    const results = document.querySelector('#search-results');
    if (input) input.value = '';
    if (results) results.innerHTML = '';
    /* blur, otherwise the keyboard stays up behind a closed panel */
    document.activeElement?.blur?.();
  };

  /* ---------------------------------------------------------- checkout */

  /* The city field spells out both tiers using the live figures from the
     admin panel, so the hint never disagrees with the charge below it. */
  const cityChargeHint = () => {
    const config = Store.state.shipping;
    const local = (config.localCities || []).join(' & ') || 'Islamabad & Rawalpindi';
    const free = config.freeDeliveryOver > 0
      ? ` Free delivery over ${money(config.freeDeliveryOver)}.`
      : '';
    return `${local}: delivery ${money(config.deliveryFee)}.${free} Every other Pakistan city: shipping ${money(config.shippingFee)}.`;
  };

  const CHECKOUT_FIELDS = [
    { id: 'co-name', label: 'Full name', type: 'text', placeholder: 'e.g. Ahmed Khan' },
    { id: 'co-email', label: 'Email address', type: 'email', placeholder: 'you@example.com', hint: 'Your order confirmation and tracking link go here.' },
    { id: 'co-phone', label: 'Phone number', type: 'tel', placeholder: '03XX XXXXXXX', hint: 'The courier calls this number before delivery.' },
    { id: 'co-city', label: 'Delivery city', type: 'city', hint: cityChargeHint },
    { id: 'co-address', label: 'Delivery address', type: 'textarea', placeholder: 'House / flat no, street, area, landmark' },
    { id: 'co-notes', label: 'Order notes (optional)', type: 'textarea', placeholder: 'Anything the courier should know', optional: true }
  ];

  const PAYMENT_METHODS = [
    { value: 'Cash on delivery', label: 'Cash on delivery', blurb: 'Pay the courier in cash when the parcel arrives.' },
    { value: 'Bank transfer', label: 'Bank transfer', blurb: 'Transfer the total to our account, then send us the receipt.' }
  ];

  function buildCheckout() {
    if (document.querySelector('#checkout-modal')) return;
    const modal = document.createElement('div');
    modal.className = 'store-modal checkout-modal';
    modal.id = 'checkout-modal';
    modal.innerHTML = `
      <div class="store-modal-card checkout-card">
        <button type="button" class="modal-close" data-close-checkout aria-label="Close checkout">×</button>
        <div class="checkout-layout">
          <div class="checkout-main">
            <p class="eyebrow">CHECKOUT</p>
            <h3>Place your order</h3>
            <form id="checkout-form">
              ${CHECKOUT_FIELDS.map(field => {
                if (field.type === 'textarea') {
                  return `<label class="co-field">${field.label}
                    <textarea id="${field.id}" rows="${field.optional ? 2 : 3}" placeholder="${field.placeholder || ''}" ${field.optional ? '' : 'required'}></textarea>
                    ${field.hint ? `<span class="co-hint">${field.hint}</span>` : ''}</label>`;
                }
                if (field.type === 'city') {
                  return `<label class="co-field">${field.label}
                    <select id="${field.id}" required>
                      <option value="">Select your city…</option>
                      ${Store.PK_CITIES.map(city => `<option>${escapeHtml(city)}</option>`).join('')}
                    </select>
                    <span class="co-hint" id="${field.id}-hint"></span></label>`;
                }
                return `<label class="co-field">${field.label}
                  <input id="${field.id}" type="${field.type}" placeholder="${field.placeholder || ''}" ${field.optional ? '' : 'required'}>
                  ${field.hint ? `<span class="co-hint">${field.hint}</span>` : ''}</label>`;
              }).join('')}

              <fieldset class="co-methods">
                <legend>Payment method</legend>
                ${PAYMENT_METHODS.map((method, index) => `
                  <label class="co-method">
                    <input type="radio" name="co-payment" value="${method.value}" ${index === 0 ? 'checked' : ''}>
                    <span class="co-method-body">
                      <strong>${method.label}</strong>
                      <span class="co-method-blurb">${method.blurb}</span>
                    </span>
                  </label>`).join('')}
              </fieldset>

              <div class="co-bank" id="co-bank" hidden>
                <p class="co-bank-title">Bank transfer details</p>
                <p class="co-bank-note">Transfer the exact total, then email your receipt to <strong id="co-bank-email"></strong>. We dispatch as soon as the amount reflects.</p>
                <dl class="co-bank-grid" id="co-bank-grid"></dl>
              </div>

              <div class="modal-actions">
                <button type="button" class="button" data-close-checkout>Cancel</button>
                <button type="submit" class="button button-dark" id="co-submit">Confirm order &#8599;</button>
              </div>
            </form>
          </div>
          <aside class="checkout-aside">
            <p class="eyebrow">ORDER SUMMARY</p>
            <div id="checkout-summary"></div>
          </aside>
        </div>
      </div>`;
    document.body.appendChild(modal);

    const form = modal.querySelector('#checkout-form');
    const citySelect = modal.querySelector('#co-city');
    const bankBox = modal.querySelector('#co-bank');
    const bankGrid = modal.querySelector('#co-bank-grid');
    const bankEmail = modal.querySelector('#co-bank-email');

    const refresh = () => refreshCheckoutSummary(modal);

    /* Payment method switches the bank panel and re-prices the order. */
    form.querySelectorAll('input[name="co-payment"]').forEach(radio => {
      radio.addEventListener('change', () => {
        bankBox.hidden = radio.value !== 'Bank transfer' || !radio.checked;
        refresh();
      });
    });

    /* City is the only thing inside the modal that moves the price, so it is
       the only one that needs a live re-price. Quantity changes happen in the
       cart drawer, which re-opens the checkout with fresh figures. */
    citySelect.addEventListener('change', refresh);

    modal.querySelectorAll('[data-close-checkout]').forEach(button => button.addEventListener('click', () => modal.classList.remove('show')));
    modal.addEventListener('click', event => { if (event.target === modal) modal.classList.remove('show'); });
    form.addEventListener('submit', event => submitCheckout(modal, event));
  }

  /* Bank details are rendered from the admin-editable config, so a change in
     the Studio dashboard is reflected here without touching this file. */
  const paintBankDetails = modal => {
    const config = Store.state.shipping;
    const details = config.bankDetails;
    const grid = modal.querySelector('#co-bank-grid');
    if (!grid) return;
    const rows = [
      ['Bank', details.bankName],
      ['Account title', details.accountTitle],
      ['Account number', details.accountNumber],
      ['IBAN', details.iban],
      ['Bank code', details.bankCode],
      ['Branch', details.branch]
    ].filter(row => row[1]);
    grid.innerHTML = rows.map(([label, value]) =>
      `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('');
    const email = modal.querySelector('#co-bank-email');
    if (email) email.textContent = config.supportEmail;
  };

  const currentPaymentMethod = modal => {
    const picked = modal.querySelector('input[name="co-payment"]:checked');
    return picked ? picked.value : PAYMENT_METHODS[0].value;
  };

  /* One pricing path, used by the live summary AND by submit, so the figure
     the customer agreed to can never drift from what gets stored. */
  const quoteForCheckout = modal => {
    const lines = cartLines();
    const subtotal = lines.reduce((sum, entry) => sum + entry.total, 0);
    const city = modal.querySelector('#co-city').value;
    return {
      lines,
      subtotal,
      city,
      quote: Store.shippingQuote({ subtotal, city, payment: currentPaymentMethod(modal) })
    };
  };

  function refreshCheckoutSummary(modal) {
    const summary = modal.querySelector('#checkout-summary');
    if (!summary) return;
    const { lines, subtotal, city, quote } = quoteForCheckout(modal);
    const units = lines.reduce((sum, entry) => sum + entry.line.quantity, 0);

    const rows = lines.map(entry => `
      <div class="co-line">
        <img src="${escapeAttr(entry.image || '')}" alt="${escapeAttr(entry.product.name + (entry.line.color ? ' in ' + entry.line.color : ''))}">
        <div>
          <strong>${escapeHtml(entry.product.name)}</strong>
          <span>${entry.product.sku ? `SKU ${escapeHtml(entry.product.sku)} · ` : ''}${entry.line.color ? `${escapeHtml(entry.line.color)} · ` : 'Colour not selected · '}${entry.product.fitOptionsEnabled ? escapeHtml(optionSummary(entry.line.options)) : escapeHtml(entry.line.size || 'Size not selected')} · Qty ${entry.line.quantity}</span>
        </div>
        <em>${money(entry.total)}</em>
      </div>`).join('');

    /* Own-route cities see "Delivery charges", everyone else sees
       "Shipping charges" — the label comes straight off the quote so it can
       never drift from the tier the customer was actually billed on. */
    const charges = [];
    const chargeRow = city
      ? `${quote.label} to ${escapeHtml(city)}`
      : quote.label;
    if (quote.waived) {
      charges.push(`<div class="co-charge is-free"><span>${chargeRow}</span><em>Free</em></div>`);
    } else {
      /* Waived orders still belong to the own-route tier, so this is the tier
         fee the customer would otherwise have paid. */
      charges.push(`<div class="co-charge"><span>${chargeRow}</span><em>${money(quote.baseFee)}</em></div>`);
    }

    summary.innerHTML = `
      <p class="co-summary-count">${units} item${units === 1 ? '' : 's'}</p>
      <div class="co-lines">${rows}</div>
      <div class="co-charges">
        <div class="co-charge"><span>Subtotal</span><em>${money(subtotal)}</em></div>
        ${charges.join('')}
      </div>
      <div class="co-total"><span>Total</span><strong>${money(quote.total)}</strong></div>
      <p class="co-delivery-note">${city
        ? `Delivering to <strong>${escapeHtml(city)}</strong>`
        : 'Choose your city to see the delivery charge'}</p>`;

    /* Keep the field hint in step with the figures above it, so changing an
       amount in the admin panel is reflected on the very next render. */
    const hint = modal.querySelector('#co-city-hint');
    if (hint) hint.textContent = cityChargeHint();

    const submit = modal.querySelector('#co-submit');
    if (submit) submit.textContent = `Confirm order · ${money(quote.total)} \u2197`;
    paintBankDetails(modal);
  }

  /* Sends the order to the server, which saves it and emails the customer their
     tracking link. The local copy is still written first so the studio's own
     browser (and the admin panel) sees the order even with no server running —
     the server's copy simply overwrites the reference fields when it answers. */
  function submitCheckout(modal, event) {
    event.preventDefault();
    const submit = modal.querySelector('#co-submit');
    if (submit && submit.disabled) return;
    const { lines, city, quote } = quoteForCheckout(modal);
    if (!lines.length) { notify('Your bag is empty'); return; }
    const missingColor = lines.find(entry => !entry.line.color);
    if (missingColor) {
      notify('Choose a colour for each item before placing your order');
      modal.classList.remove('show');
      closeDrawers();
      openDrawer('cart-drawer');
      return;
    }
    if (!city) { notify('Please choose your delivery city'); modal.querySelector('#co-city').focus(); return; }

    const payment = currentPaymentMethod(modal);
    const email = modal.querySelector('#co-email').value.trim();
    const items = lines.map(entry => ({
      name: entry.product.name,
      sku: entry.product.sku || '',
      color: entry.line.color || '',
      size: entry.line.size || '',
      options: entry.line.options || {},
      qty: entry.line.quantity,
      price: entry.price
    }));
    const local = Store.createOrder({
      customer: modal.querySelector('#co-name').value.trim(),
      email,
      phone: modal.querySelector('#co-phone').value.trim(),
      address: modal.querySelector('#co-address').value.trim(),
      city,
      notes: modal.querySelector('#co-notes').value.trim(),
      payment,
      /* COD is collected by the courier, so it is not paid yet. A bank
         transfer is also unpaid until the receipt lands — both start as
         Pending and the studio flips them to Paid. */
      status: 'Pending',
      shipping: quote,
      items
    });

    if (submit) { submit.disabled = true; submit.textContent = 'Placing your order…'; }

    /* Never let a network failure cost the customer their order: the local copy
       is already saved, so on any error we simply confirm it offline. */
    Store.api.create({
      customer: local.customer,
      email: local.email,
      phone: local.phone,
      address: local.address,
      city: local.city,
      notes: local.notes,
      payment: local.payment,
      date: local.date,
      shipping: local.shipping,
      total: Store.orderTotal(local),
      items
    })
      .then(result => {
        /* The server is the source of truth for the reference, so adopt its
           order number and tracking ID — the emailed link must match. */
        if (result && result.order) {
          local.id = result.order.id;
          local.trackingId = result.order.trackingId;
          local.sent = !!result.emailQueued;
          local.trackUrl = result.trackUrl || '';
        }
        finishOrder(local);
      })
      .catch(() => finishOrder(local));
  }

  function finishOrder(order) {
    cart = [];
    saveCart();
    updateCart();
    closeDrawers();
    const modal = document.querySelector('#checkout-modal');
    if (modal) modal.remove();
    renderProducts(currentFilter);
    showOrderConfirmation(order);
  }

  /* Confirmation doubles as the receipt: the customer sees exactly what was
     charged, how to pay, and their tracking reference — the same three facts
     the order note carries to the studio. */
  const showOrderConfirmation = order => {
    const config = Store.state.shipping;
    const payment = order.payment;
    const quote = order.shipping || {};
    const isBank = payment === 'Bank transfer';
    const total = Store.orderTotal(order);
    /* Older orders predate the label on the quote, so fall back to the plain
       wording rather than showing "undefined charges" on a receipt. */
    const chargeLabel = quote.label || 'Delivery charges';
    const chargeAmount = quote.waived ? 'Free' : money(quote.baseFee != null ? quote.baseFee : (quote.delivery || 0));

    const instructions = isBank ? `
      <div class="confirm-block">
        <p class="eyebrow">PAY BY BANK TRANSFER</p>
        <p class="confirm-note">Send <strong>${money(total)}</strong> to the account below, then email your receipt to <strong>${escapeHtml(config.supportEmail)}</strong>.</p>
        <dl class="co-bank-grid">
          ${[['Bank', config.bankDetails.bankName], ['Account title', config.bankDetails.accountTitle], ['Account number', config.bankDetails.accountNumber], ['IBAN', config.bankDetails.iban], ['Bank code', config.bankDetails.bankCode]]
            .filter(row => row[1])
            .map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}
        </dl>
      </div>` : '';

    const modal = document.createElement('div');
    modal.className = 'store-modal show';
    modal.id = 'confirmation-modal';
    const items = (order.items || []).map(item => {
      const variant = optionSummary(item.options) || item.selectedSize || item.size || '';
      const details = [item.color || item.colour, variant].filter(Boolean).map(escapeHtml).join(' · ');
      return `<div><span><strong>${escapeHtml(item.qty)} × ${escapeHtml(item.name)}</strong>${details ? `<small>${details}</small>` : ''}</span><em>${money(item.price * item.qty)}</em></div>`;
    }).join('');
    const address = [order.address, order.city].filter(Boolean).map(escapeHtml).join(', ') || 'Not provided';

    modal.innerHTML = `
      <div class="store-modal-card confirm-card">
        <p class="eyebrow">ORDER CONFIRMED</p>
        <h3>Thank you, ${escapeHtml(order.customer)}</h3>
        <p class="confirm-sub">Your order has been placed successfully.</p>

        <div class="confirm-track">
          <div><span>Order Number</span><strong>${escapeHtml(order.id)}</strong></div>
        </div>

        <div class="confirm-block">
          <p class="eyebrow">SHIPPING ADDRESS</p>
          <p class="confirm-note">${address}</p>
        </div>

        <div class="confirm-items">
          <p class="eyebrow">ITEMS ORDERED</p>
          ${items || '<p class="confirm-note">No item details available.</p>'}
        </div>

        <div class="co-charges">
          <div class="co-charge"><span>Subtotal</span><em>${money(quote.subtotal || 0)}</em></div>
          <div class="co-charge${quote.waived ? ' is-free' : ''}"><span>${escapeHtml(chargeLabel)}${quote.isLocalCity && order.city ? ' to ' + escapeHtml(order.city) : ''}</span><em>${chargeAmount}</em></div>
          <div class="co-total"><span>Total</span><strong>${money(Store.orderTotal(order))}</strong></div>
        </div>

        ${instructions}

        <div class="confirm-notice" role="note">
          <p class="eyebrow">DELIVERY &amp; TRACKING</p>
          <p>Your order will be delivered within 3-4 working days. To track your parcel, please check your email and click on 'TRACK YOUR PARCEL' to view live updates.</p>
        </div>

        <div class="modal-actions">
          <button type="button" class="button button-dark" data-confirm-close>Done</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    modal.addEventListener('click', event => {
      if (event.target === modal || event.target.closest('[data-confirm-close]')) modal.remove();
    });
  }

  const openCheckout = () => {
    buildCheckout();
    const modal = document.querySelector('#checkout-modal');
    const bankBox = modal.querySelector('#co-bank');
    const picked = modal.querySelector('input[name="co-payment"]:checked');
    if (bankBox) bankBox.hidden = !picked || picked.value !== 'Bank transfer';
    refreshCheckoutSummary(modal);
    modal.classList.add('show');
  };

  /* ------------------------------------------------- storefront filters */

  let currentFilter = 'all';

  /* Delegated so the filter buttons built later by syncFilterButtons work too. */
  document.addEventListener('click', event => {
    const button = event.target.closest('.filter, .catalog-filter');
    if (!button) return;
    const filter = button.dataset.filter || 'all';
    currentFilter = filter;
    setActiveFilter(filter);
    renderProducts(filter);
  });

  document.querySelector('.cart-trigger')?.addEventListener('click', () => openDrawer('cart-drawer'));
  document.querySelector('.search-trigger')?.addEventListener('click', () => openDrawer('search-panel'));
  document.querySelectorAll('.close-panel,.scrim').forEach(button => button.addEventListener('click', closeDrawers));
  document.querySelector('.checkout-button')?.addEventListener('click', openCheckout);

  document.querySelector('#search-input')?.addEventListener('input', event => {
    const query = event.target.value.trim().toLowerCase();
    const results = document.querySelector('#search-results');
    if (!results) return;
    const matched = Store.state.products.filter(product => product.name.toLowerCase().includes(query));
    results.innerHTML = matched.map(product => {
      const index = Store.state.products.indexOf(product);
      return `<a class="search-result" href="product.html?product=${index}">${escapeHtml(product.name)}<span>${Store.priceRangeMarkup(product)}</span></a>`;
    }).join('') || '<p class="muted">No matches found.</p>';
  });

  document.querySelector('#newsletter-form')?.addEventListener('submit', event => {
    event.preventDefault();
    event.target.innerHTML = '<p style="color:#d9c1ae;font-size:12px">You are on the list. Welcome in.</p>';
  });

  /* ------------------------------------------------------- product detail page */

  /* The storefront no longer ships a fixed palette. Every colour shown to a
     shopper comes from the admin panel, together with its own picture(s). */

  const detailImage = document.querySelector('#detail-image');
  if (detailImage) {
    const index = Number(new URLSearchParams(window.location.search).get('product')) || 0;
    const product = Store.state.products[index] || Store.state.products[0];
    if (product) {
      const quantityEl = document.querySelector('#quantity-value');
      const selectedQuantity = () => Math.max(1, parseInt(quantityEl?.value ?? quantityEl?.textContent, 10) || 1);
      const gallery = document.querySelector('#detail-gallery');
      const detailPrice = document.querySelector('#detail-price');
      const inventoryBadge = document.createElement('span');
      inventoryBadge.className = 'product-inventory-badge';
      inventoryBadge.hidden = true;
      inventoryBadge.setAttribute('aria-live', 'polite');
      let comparePrice = document.querySelector('#detail-compare-price');
      if (!comparePrice && detailPrice) {
        comparePrice = document.createElement('del');
        comparePrice.id = 'detail-compare-price';
        comparePrice.hidden = true;
        detailPrice.before(comparePrice);
      }
      let galleryIndex = 0;

      const colorCandidates = (product.colors || [])
        .concat(Object.keys(product.colorVariants || {}), Object.keys(product.fitInventory || {}), Object.keys(product.colorImages || {}))
        .filter((color, position, list) => color && list.indexOf(color) === position);
      const colorHasStock = color => {
        if (product.fitOptionsEnabled && Array.isArray(product.fitVariants)) {
          return product.fitVariants.some(variant => String(variant.color || '') === String(color) && Number(variant.stock) > 0);
        }
        if (product.fitOptionsEnabled && product.fitInventory && product.fitInventory[color]) {
          const groups = product.fitOptionGroups || [];
          return groups.length > 0 && groups.every(group =>
            (product.fitInventory[color][group.label] || []).some(option => Number(option.stock) > 0));
        }
        return Store.sizesFor(product, color).some(size => Number(size.stock) > 0);
      };
      const defaultColor = colorCandidates.find(colorHasStock) || colorCandidates[0] || '';
      let sizes = Store.sizesFor(product, defaultColor);
      const sizeRow = document.querySelector('.size-options');
      const renderSizeOptions = color => {
        sizes = Store.sizesFor(product, color);
        const previouslySelected = sizeRow?.querySelector('button.selected')?.dataset.size;
        if (!sizeRow) return;
        sizeRow.innerHTML = sizes.map(size => {
          const out = size.stock <= 0;
          return `<button data-size="${escapeHtml(size.label)}" class="${out ? 'sold-out' : ''}"${out ? ' disabled' : ''} title="${out ? 'Out of stock' : size.stock + ' in stock'}">${escapeHtml(size.label)}</button>`;
        }).join('');
        const preferred = sizes.find(size => size.label === previouslySelected && size.stock > 0);
        const firstAvailable = preferred || sizes.find(size => size.stock > 0) || sizes[0];
        if (firstAvailable) sizeRow.querySelector(`[data-size="${CSS.escape(firstAvailable.label)}"]`)?.classList.add('selected');
      };
      renderSizeOptions(defaultColor);

      const selectedSize = () => {
        const active = document.querySelector('.size-options button.selected');
        const firstAvailable = sizes.find(size => size.stock > 0) || sizes[0];
        return active ? active.dataset.size : (firstAvailable ? firstAvailable.label : '');
      };
      const selectedColor = () => {
        const active = document.querySelector('#color-options .color-swatch.selected');
        return active ? active.dataset.color : defaultColor;
      };
      const fitOptionGroups = product.fitOptionsEnabled && Array.isArray(product.fitOptionGroups) ? product.fitOptionGroups : [];
      const fitOptionsEnabled = product.fitOptionsEnabled && fitOptionGroups.length > 0;
      const productMode = (product.product_type || product.productType) === 'separate' ? 'separate' : 'set';
      const separateItem = product.separateItem === 'pant' ? 'pant' : 'shirt';
      const fitSelections = {};
      const fitHost = document.createElement('div');
      fitHost.className = 'fit-options-customer';
      fitHost.dataset.productType = productMode;
      fitHost.setAttribute('aria-label', productMode === 'separate' ? `Choose ${separateItem} options` : 'Choose set options');
      if (fitOptionsEnabled && sizeRow) {
        const sizeLabel = sizeRow.previousElementSibling;
        if (sizeLabel) sizeLabel.hidden = true;
        sizeRow.hidden = true;
        sizeRow.insertAdjacentElement('afterend', fitHost);
        fitHost.innerHTML = fitOptionGroups.map((group, groupIndex) => {
          if (group.display === 'radio') {
            return `<fieldset class="fit-option-choice"><legend>${escapeHtml(group.label)} <span aria-hidden="true">*</span></legend><div>${group.values.map((value, valueIndex) => {
              const out = Store.fitValueStock(product, selectedColor(), fitSelections, group.label, value) <= 0;
              return `<label class="${out ? 'is-unavailable' : ''}" title="${out ? 'Out of stock' : ''}"><input type="radio" name="fit-option-${groupIndex}" value="${escapeAttr(value)}"${out ? ' disabled' : ''}><span>${escapeHtml(value)}</span></label>`;
            }).join('')}</div></fieldset>`;
          }
          return `<label class="fit-option-select">${escapeHtml(group.label)} <span aria-hidden="true">*</span><select data-fit-option="${escapeAttr(group.label)}"><option value="">Choose one</option>${group.values.map(value => {
            const out = Store.fitValueStock(product, selectedColor(), fitSelections, group.label, value) <= 0;
            return `<option value="${escapeAttr(value)}"${out ? ' disabled' : ''}>${escapeHtml(value)}${out ? ' — out of stock' : ''}</option>`;
          }).join('')}</select></label>`;
        }).join('');
        fitOptionGroups.forEach((group, groupIndex) => {
          fitHost.querySelectorAll(`[name="fit-option-${groupIndex}"]`).forEach(input => input.addEventListener('change', () => {
            fitSelections[group.label] = input.value;
            refreshFitAvailability();
            update();
          }));
        });
        fitHost.querySelectorAll('[data-fit-option]').forEach(select => select.addEventListener('change', () => {
          fitSelections[select.dataset.fitOption] = select.value;
          refreshFitAvailability();
          update();
        }));
      }
      const fitSelectionsComplete = () => fitOptionsEnabled && fitOptionGroups.every(group => fitSelections[group.label]);
      const selectedFitVariant = () => Store.fitVariantFor(product, selectedColor(), fitSelections);
      /* Grey out any option value whose remaining combinations all sit at zero
         stock, so a shopper never picks a combination we cannot ship. */
      const refreshFitAvailability = () => {
        if (!fitOptionsEnabled) return;
        const color = selectedColor();
        fitOptionGroups.forEach((group, groupIndex) => {
          fitHost.querySelectorAll(`[name="fit-option-${groupIndex}"]`).forEach(input => {
            const out = Store.fitValueStock(product, color, fitSelections, group.label, input.value) <= 0;
            input.disabled = out;
            input.closest('label')?.classList.toggle('is-unavailable', out);
            if (out && input.checked) input.checked = false;
          });
          const select = fitHost.querySelector(`[data-fit-option="${CSS.escape(group.label)}"]`);
          if (select) {
            select.querySelectorAll('option').forEach(option => {
              if (!option.value) return;
              const out = Store.fitValueStock(product, color, fitSelections, group.label, option.value) <= 0;
              option.disabled = out;
              option.textContent = option.value + (out ? ' — out of stock' : '');
            });
            if (select.value && Store.fitValueStock(product, color, fitSelections, group.label, select.value) <= 0) {
              delete fitSelections[group.label];
              select.value = '';
            }
          }
        });
      };
      refreshFitAvailability();

      const skuLine = document.createElement('span');
      skuLine.className = 'detail-sku';
      skuLine.id = 'detail-sku';
      const availability = document.querySelector('.availability');
      if (availability) {
        skuLine.hidden = !product.sku;
        skuLine.textContent = product.sku ? 'SKU: ' + product.sku : '';
        availability.insertAdjacentElement('afterend', skuLine);
      }
      const mediaLinks = document.createElement('div');
      mediaLinks.className = 'product-detail-links';
      const categoryLabel = String(Store.categoryName(product.category) || product.category || '').toLowerCase();
      const productLabel = String(product.name || '').toLowerCase();
      const categoryIsSet = /(co[\s-]?ord|suit|pair)/.test(categoryLabel);
      const categoryIsShirt = /(shirt|top)/.test(categoryLabel);
      const categoryIsTrouser = /(trouser|pant|bottom)/.test(categoryLabel);
      const productIsSet = /(co[\s-]?ord|suit|pair)/.test(productLabel);
      const productIsShirt = /(shirt|top)/.test(productLabel);
      const productIsTrouser = /(trouser|pant|bottom)/.test(productLabel);
      /* A recognised category always wins. Product names only classify products
         assigned to general shelves such as New Arrivals. */
      const chartKinds = categoryIsSet ? ['shirt', 'trouser']
        : categoryIsShirt ? ['shirt']
          : categoryIsTrouser ? ['trouser']
            : productIsSet ? ['shirt', 'trouser']
              : productIsShirt ? ['shirt'] : productIsTrouser ? ['trouser'] : ['shirt', 'trouser'];
      const shirtRows = [
        ['XS', '14', '18', '21', '48'], ['S', '14', '19', '22', '48'], ['SM', '14.5', '20', '23', '48'],
        ['M', '15', '21', '24', '48'], ['ML', '15.5', '23', '26', '48'], ['L', '16', '24', '27.5', '48'],
        ['XL', '16', '25', '28.5', '48'], ['XXL', '17', '27', '31', '48']
      ];
      const trouserRows = [
        ['XS', '18', '11.5', '5.5', '36'], ['S', '20', '12', '5.5', '36'], ['SM', '20.5', '12.5', '6', '36'],
        ['M', '21', '13', '6.5', '36'], ['ML', '22', '13.5', '7', '36'], ['L', '24', '14', '7.5', '36'],
        ['XL', '26', '15', '8', '36'], ['XXL', '28', '18', '9', '36']
      ];
      const chartParts = chartKinds.map(kind => ({
        kind,
        title: kind === 'shirt' ? 'Shirt' : 'Trouser / pant',
        columns: kind === 'shirt' ? ['Size', 'Shoulder', 'Bust', 'Hip', 'Length'] : ['Size', 'Hip', 'Thigh', 'Bottom', 'Length'],
        rows: kind === 'shirt' ? shirtRows : trouserRows
      }));
      mediaLinks.innerHTML = `<button type="button" data-open-delivery-policy>Delivery &amp; Returns</button><button type="button" data-open-size-chart>Size Chart / Measurements</button>`;
      const sizeLabelAnchor = fitOptionsEnabled ? fitHost : document.querySelector('.size-options');
      if (sizeLabelAnchor) sizeLabelAnchor.insertAdjacentElement('afterend', mediaLinks);
      else document.querySelector('.product-actions')?.insertAdjacentElement('beforebegin', mediaLinks);
      const splitImageHost = document.createElement('div');
      splitImageHost.className = 'product-split-images';
      splitImageHost.hidden = true;
      const imageStage = document.createElement('div');
      imageStage.className = 'product-detail-media-stage';
      detailImage.before(imageStage);
      imageStage.append(detailImage, splitImageHost);
      imageStage.appendChild(inventoryBadge);
      imageStage.addEventListener('pointermove', event => {
        const image = event.target.closest('#detail-image, .product-split-images img');
        if (!image || event.pointerType !== 'mouse') return;
        const rect = image.getBoundingClientRect();
        imageStage.style.setProperty('--zoom-x', `${((event.clientX - rect.left) / rect.width) * 100}%`);
        imageStage.style.setProperty('--zoom-y', `${((event.clientY - rect.top) / rect.height) * 100}%`);
        imageStage.classList.add('is-hover-zoom');
      });
      imageStage.addEventListener('pointerleave', () => imageStage.classList.remove('is-hover-zoom'));
      imageStage.addEventListener('click', event => {
        if (!event.target.closest('#detail-image, .product-split-images img')) return;
        imageStage.classList.toggle('is-tap-zoom');
      });
      /* Category-selected measurement tables are rendered as HTML; no chart
         image upload or per-product chart data is required. */
      const sizeChartPanel = document.createElement('div');
      sizeChartPanel.className = 'product-size-chart';
      sizeChartPanel.setAttribute('role', 'dialog');
      sizeChartPanel.setAttribute('aria-modal', 'true');
      sizeChartPanel.setAttribute('aria-label', product.name + ' size chart');
      sizeChartPanel.hidden = true;
      const renderChartPart = part => `<section class="product-size-chart-part"><h4>${escapeHtml(part.title)} measurements</h4><div class="size-chart-table-wrap"><table class="size-chart-table"><thead><tr>${part.columns.map(column => `<th scope="col">${escapeHtml(column)}</th>`).join('')}</tr></thead><tbody>${part.rows.map(row => `<tr>${row.map((value, index) => index === 0 ? `<th scope="row">${escapeHtml(value)}</th>` : `<td>${escapeHtml(value)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`;
      sizeChartPanel.innerHTML = '<div class="product-size-chart-inner">'
        + '<button type="button" class="product-size-chart-close" data-close-size-chart aria-label="Close size chart">×</button>'
        + '<h3>Size chart</h3>' + chartParts.map(renderChartPart).join('') + '</div>';
      const openSizeChart = () => {
        sizeChartPanel.hidden = false;
        document.body.classList.add('size-chart-open');
        sizeChartPanel.querySelector('[data-close-size-chart]').focus();
      };
      const closeSizeChart = () => {
        sizeChartPanel.hidden = true;
        document.body.classList.remove('size-chart-open');
      };
      document.body.appendChild(sizeChartPanel);
      sizeChartPanel.querySelector('[data-close-size-chart]').addEventListener('click', closeSizeChart);
      sizeChartPanel.addEventListener('click', event => { if (event.target === sizeChartPanel) closeSizeChart(); });
      mediaLinks.querySelector('[data-open-size-chart]')?.addEventListener('click', openSizeChart);

      const deliveryPolicyPanel = document.createElement('div');
      deliveryPolicyPanel.className = 'product-size-chart product-policy-modal';
      deliveryPolicyPanel.setAttribute('role', 'dialog');
      deliveryPolicyPanel.setAttribute('aria-modal', 'true');
      deliveryPolicyPanel.setAttribute('aria-label', 'Delivery and returns policy');
      deliveryPolicyPanel.hidden = true;
      deliveryPolicyPanel.innerHTML = '<div class="product-size-chart-inner">'
        + '<button type="button" class="product-size-chart-close" data-close-policy aria-label="Close delivery policy">×</button>'
        + '<h3>Delivery &amp; Returns</h3>'
        + '<section class="product-size-chart-part"><h4>2.6 Tracking information</h4><p>Once your order is placed, your Tracking ID and Order ID will be automatically sent to your WhatsApp number and Email. To track your parcel, navigate to our website footer, click \'Track Your Order\', and enter your Tracking ID to view real-time shipping status.</p></section>'
        + '<section class="product-size-chart-part"><h4>2.7 Delivery charges — Pakistan</h4><p>Free shipping on orders above Rs. 10,000 for Islamabad and Rawalpindi. For all other cities, delivery charges depend on standard courier rates.</p></section></div>';
      document.body.appendChild(deliveryPolicyPanel);
      const openPolicy = () => { deliveryPolicyPanel.hidden = false; document.body.classList.add('size-chart-open'); deliveryPolicyPanel.querySelector('[data-close-policy]').focus(); };
      const closePolicy = () => { deliveryPolicyPanel.hidden = true; document.body.classList.remove('size-chart-open'); };
      deliveryPolicyPanel.querySelector('[data-close-policy]').addEventListener('click', closePolicy);
      deliveryPolicyPanel.addEventListener('click', event => { if (event.target === deliveryPolicyPanel) closePolicy(); });
      mediaLinks.querySelector('[data-open-delivery-policy]')?.addEventListener('click', openPolicy);
      document.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        if (!sizeChartPanel.hidden) closeSizeChart();
        if (!deliveryPolicyPanel.hidden) closePolicy();
      });

      /* Colour pictures uploaded from the admin panel, keyed by colour name.
         A colour may hold a single picture or a list of pictures. */
      const colorImages = product.colorImages && typeof product.colorImages === 'object' ? product.colorImages : {};
      const picturesForColor = colorName => {
        const value = colorImages[colorName];
        if (Array.isArray(value)) return value.filter(Boolean);
        return typeof value === 'string' && value ? [value] : [];
      };

      /* Only the colours the admin saved on this product are shown. A colour is
         listed when it has a name; its picture(s) come from the admin upload. */
      const colorHexes = product.colorHexes && typeof product.colorHexes === 'object' ? product.colorHexes : {};
      const savedColors = Array.isArray(product.colors) ? product.colors : [];
      const colors = savedColors
        .concat(Object.keys(product.colorVariants || {}), Object.keys(product.fitInventory || {}), Object.keys(colorImages))
        .filter((name, position, list) => name && list.indexOf(name) === position);
      const colorRow = document.querySelector('#color-options');
      const colorLabel = document.querySelector('#selected-color');
      const colorField = colorRow?.closest('.color-row');
      colorRow?.setAttribute('aria-label', 'Choose a colour');
      const standardColorHexes = {
        red: '#d72638',
        orange: '#f28c28',
        blue: '#2563eb',
        'royal blue': '#4169e1',
        green: '#2f855a',
        emerald: '#047857',
        yellow: '#facc15',
        pink: '#ec4899',
        purple: '#7e22ce',
        plum: '#8e4585',
        brown: '#8b5e3c',
        charcoal: '#36454f',
        black: '#171717',
        white: '#ffffff',
        bone: '#e8dfcd',
        ivory: '#f4efdf',
        cream: '#f3ead5',
        beige: '#d8c5a5',
        oatmeal: '#cbb99b',
        olive: '#74764a',
        navy: '#1e3a5f',
        grey: '#888888',
        gray: '#888888'
      };
      if (colorField && colorRow) {
        colorRow.hidden = false;
        colorField.querySelector('.color-preview-note')?.remove();
      }
      if (colorRow) {
        const hexFor = name => {
          const custom = colorHexes[name] || colorHexes[String(name).toLowerCase()];
          return (typeof custom === 'string' && custom) || standardColorHexes[String(name).trim().toLowerCase()] || '#a4a29e';
        };
        colorRow.innerHTML = colors.map((color, position) => {
          const outOfStock = !colorHasStock(color);
          const hasPictures = picturesForColor(color).length > 0;
          const picture = picturesForColor(color)[0];
          const count = picturesForColor(color).length;
          return `<button type="button" class="color-swatch${hasPictures ? ' has-image' : ''}${outOfStock ? ' is-out-of-stock' : ''}${color === defaultColor ? ' selected' : ''}" data-color="${escapeAttr(color)}"${outOfStock ? ' disabled aria-disabled="true"' : ''} title="${escapeAttr(color)}${outOfStock ? ' — out of stock' : hasPictures ? ' — ' + count + ' picture' + (count > 1 ? 's' : '') : ''}" aria-label="${escapeAttr(color)}${outOfStock ? ' — out of stock' : ''}" style="--swatch:${hexFor(color)}${picture ? `;--swatch-image:url('${escapeAttr(picture)}')` : ''}"></button>`;
        }).join('');
      }
      const paintColors = () => {
        const chosen = selectedColor();
        if (colorLabel) colorLabel.textContent = chosen || '—';
        colorRow?.querySelectorAll('.color-swatch').forEach(button => {
          button.classList.toggle('selected', button.dataset.color === chosen);
        });
      };
      if (colorRow) {
        colorRow.addEventListener('click', event => {
          const button = event.target.closest('.color-swatch');
          if (!button || button.disabled) return;
          colorRow.querySelectorAll('.color-swatch').forEach(item => item.classList.remove('selected'));
          button.classList.add('selected');
          paintColors();
          renderSizeOptions(button.dataset.color);
          refreshFitAvailability();
          update();
          /* Swap the product picture(s) to the chosen colour's own images. */
          galleryIndex = 0;
          paintImage();
        });
        paintColors();
      }

      const update = () => {
        const label = selectedSize();
        const quantity = Number(quantityEl.textContent) || 1;
        const color = selectedColor();
        const fitVariant = fitOptionsEnabled ? selectedFitVariant() : null;
        const price = fitOptionsEnabled ? numOr(product.price) : Store.priceFor(product, label, color);
        const stock = fitOptionsEnabled ? (fitVariant ? fitVariant.stock : 0) : Store.stockFor(product, label, color);
        const badgeStock = fitOptionsEnabled && !fitSelectionsComplete() ? Store.totalStock(product) : stock;
        if (badgeStock === 0) {
          inventoryBadge.textContent = 'Sold Out';
          inventoryBadge.classList.add('is-sold-out');
          inventoryBadge.hidden = false;
        } else if (badgeStock > 0 && badgeStock <= 5) {
          inventoryBadge.textContent = `Only ${badgeStock} left`;
          inventoryBadge.classList.remove('is-sold-out');
          inventoryBadge.hidden = false;
        } else {
          inventoryBadge.hidden = true;
          inventoryBadge.classList.remove('is-sold-out');
        }
        const compare = fitOptionsEnabled ? 0 : Store.compareAtPriceFor(product, label, color);
        if (detailPrice) {
          detailPrice.textContent = money(price);
          detailPrice.classList.toggle('is-sale', compare > price);
        }
        if (comparePrice) {
          comparePrice.textContent = compare > price ? money(compare) : '';
          comparePrice.hidden = compare <= price;
        }
        const subtotalEl = document.querySelector('#detail-subtotal');
        if (subtotalEl) subtotalEl.textContent = money(price * quantity);
        const sizeLabel = document.querySelector('#selected-size');
        if (sizeLabel && !fitOptionsEnabled) sizeLabel.textContent = label || '—';
        const availabilityStatus = document.querySelector('.availability strong');
        if (availabilityStatus) {
          availabilityStatus.textContent = fitOptionsEnabled
            ? (!fitSelectionsComplete() ? 'Select all options' : (stock > 0 ? stock + ' in stock' : 'Out of stock'))
            : (stock > 0 ? label + ' · ' + stock + ' in stock' : label + ' · Out of stock');
        }
        const allColorsOutOfStock = colors.length > 0 && !colors.some(colorHasStock);
        const canPurchase = !allColorsOutOfStock && (fitOptionsEnabled
          ? Store.totalStock(product) > 0 && (!fitSelectionsComplete() || Boolean(fitVariant && fitVariant.stock > 0))
          : stock > 0);
        document.querySelectorAll('.detail-add, .buy-now').forEach(button => {
          button.disabled = !canPurchase;
          button.classList.toggle('is-stock-unavailable', !canPurchase);
          button.setAttribute('aria-disabled', String(!canPurchase));
        });
        const addButton = document.querySelector('.detail-add');
        if (addButton) addButton.innerHTML = allColorsOutOfStock ? 'OUT OF STOCK' : badgeStock === 0 ? 'SOLD OUT' : 'ADD TO BAG <span>&#8599;</span>';
        const buyButton = document.querySelector('.buy-now');
        if (buyButton) buyButton.textContent = allColorsOutOfStock ? 'OUT OF STOCK' : 'Buy it now';
        sizeRow?.querySelectorAll('button').forEach(button => {
          button.classList.toggle('selected', button.dataset.size === label);
        });
      };

      const paintImage = () => {
        imageStage.classList.remove('is-hover-zoom', 'is-tap-zoom');
        const active = colorRow && colorRow.querySelector('.color-swatch.selected');
        const chosen = active ? active.dataset.color : '';
        const colorPictures = picturesForColor(chosen);
        /* When the chosen colour has its own pictures, those replace the product
           photos; otherwise the product's default images stay on screen. */
        const gallerySources = colorPictures.length
          ? colorPictures
          : (product.gallery && product.gallery.length ? product.gallery : [product.image]);
        const splitView = product.splitImageView && gallerySources.length > 1;
        const galleryGroups = splitView
          ? Array.from({ length: Math.ceil(gallerySources.length / 2) }, (_, position) => gallerySources.slice(position * 2, position * 2 + 2))
          : gallerySources.map(source => [source]);
        if (galleryIndex >= galleryGroups.length) galleryIndex = 0;
        const shownImages = galleryGroups[galleryIndex] || [gallerySources[0] || product.image];
        detailImage.hidden = splitView;
        splitImageHost.hidden = !splitView;
        detailImage.alt = chosen ? product.name + ' in ' + chosen : product.name;
        if (splitView) {
          splitImageHost.classList.toggle('is-single', shownImages.length === 1);
          splitImageHost.innerHTML = shownImages.map((source, position) =>
            `<img src="${escapeAttr(source)}" alt="${escapeAttr(product.name)} view ${galleryIndex * 2 + position + 1}">`).join('');
        } else {
          detailImage.src = shownImages[0] || product.image;
        }
        if (gallery) {
          gallery.innerHTML = galleryGroups.map((images, position) =>
            `<button data-gallery="${position}" class="${position === galleryIndex ? 'active' : ''}${splitView ? ' split-gallery-thumb' : ''}" aria-label="${escapeAttr(product.name)} gallery view ${position + 1}">${images.map(source => `<img src="${escapeAttr(source)}" alt="${escapeAttr(product.name)} view">`).join('')}</button>`).join('');
          gallery.querySelectorAll('[data-gallery]').forEach(button => button.addEventListener('click', () => {
            galleryIndex = Number(button.dataset.gallery);
            paintImage();
          }));
        }
      };
      paintImage();

      const nameEl = document.querySelector('#detail-name');
      if (nameEl) {
        nameEl.textContent = product.name;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'product-wishlist detail-wishlist';
        button.dataset.wishlistProduct = String(index);
        button.setAttribute('aria-label', wishlist.has(index) ? 'Remove from wishlist' : 'Add to wishlist');
        button.setAttribute('aria-pressed', String(wishlist.has(index)));
        button.title = wishlist.has(index) ? 'Remove from wishlist' : 'Add to wishlist';
        button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 8.6c0 5.4-8.8 11-8.8 11s-8.8-5.6-8.8-11A4.6 4.6 0 0 1 12 6a4.6 4.6 0 0 1 8.8 2.6Z"/></svg>';
        if (wishlist.has(index)) button.classList.add('is-saved');
        nameEl.insertAdjacentElement('afterend', button);
      }
      const crumb = document.querySelector('#product-breadcrumb');
      if (crumb) crumb.textContent = product.name;
      const tagEl = document.querySelector('#detail-tag');
      if (tagEl) {
        /* only real tags earn a badge — no badge when the piece has none */
        tagEl.textContent = product.tag || '';
        tagEl.hidden = !product.tag;
      }
      const descriptionEl = document.querySelector('.detail-description');
      if (descriptionEl) descriptionEl.textContent = product.description;
      const basePrice = document.querySelector('#detail-price');
      if (basePrice) basePrice.textContent = money(product.price);

      sizeRow?.addEventListener('click', event => {
        const button = event.target.closest('button[data-size]');
        if (!button || button.disabled) return;
        sizeRow.querySelectorAll('button').forEach(item => item.classList.remove('selected'));
        button.classList.add('selected');
        update();
      });

      document.querySelector('#plus')?.addEventListener('click', () => {
        const label = selectedSize();
        const fitVariant = fitOptionsEnabled ? selectedFitVariant() : null;
        const ceiling = fitOptionsEnabled ? (fitVariant ? fitVariant.stock : 0) : Store.stockFor(product, label, selectedColor());
        if (Number(quantityEl.textContent) >= ceiling) { notify('Only ' + ceiling + ' available in ' + (fitOptionsEnabled ? optionSummary(fitSelections) : label)); return; }
        quantityEl.textContent = Number(quantityEl.textContent) + 1;
        update();
      });
      document.querySelector('#minus')?.addEventListener('click', () => {
        quantityEl.textContent = Math.max(1, Number(quantityEl.textContent) - 1);
        update();
      });

      document.querySelector('.detail-add')?.addEventListener('click', () => {
        const quantity = selectedQuantity();
        if (fitOptionsEnabled) {
          const missing = fitOptionGroups.find(group => !fitSelections[group.label]);
          if (missing) {
            notify('Please choose ' + missing.label);
            const control = fitHost.querySelector(`[data-fit-option="${CSS.escape(missing.label)}"]`) || fitHost.querySelector(`[name="fit-option-${fitOptionGroups.indexOf(missing)}"]`);
            control?.focus();
            return;
          }
          const variant = selectedFitVariant();
          if (!variant || variant.stock <= 0) { notify('That colour and option combination is out of stock'); return; }
          addToCart({ productIndex: index, color: selectedColor(), options: Object.assign({}, fitSelections), quantity });
          return;
        }
        const label = selectedSize();
        if (Store.stockFor(product, label, selectedColor()) <= 0) { notify(selectedColor() + ' / ' + label + ' is out of stock'); return; }
        addToCart({ productIndex: index, size: label, color: selectedColor(), quantity });
      });
      document.querySelector('.buy-now')?.addEventListener('click', () => {
        const quantity = selectedQuantity();
        if (fitOptionsEnabled) {
          const missing = fitOptionGroups.find(group => !fitSelections[group.label]);
          if (missing) { notify('Please choose ' + missing.label); return; }
          const variant = selectedFitVariant();
          if (!variant || variant.stock <= 0) { notify('That colour and option combination is out of stock'); return; }
          addToCart({ productIndex: index, color: selectedColor(), options: Object.assign({}, fitSelections), quantity });
          window.setTimeout(openCheckout, 350);
          return;
        }
        const label = selectedSize();
        if (Store.stockFor(product, label, selectedColor()) <= 0) { notify(selectedColor() + ' / ' + label + ' is out of stock'); return; }
        addToCart({ productIndex: index, size: label, color: selectedColor(), quantity });
        window.setTimeout(openCheckout, 350);
      });
      update();

      const reviewsHost = document.querySelector('#detail-reviews');
      if (reviewsHost) {
        reviewsHost.innerHTML = (product.reviews || []).map(review =>
          '<div class="review-card"><strong>' + escapeHtml(review.name) + '</strong><span>' +
          '★'.repeat(review.rating) + '☆'.repeat(Math.max(0, 5 - review.rating)) +
          '</span><p>' + escapeHtml(review.text) + '</p></div>').join('');
      }
      const faqHost = document.querySelector('#detail-faqs');
      if (faqHost) {
        faqHost.innerHTML = (product.faqs || []).map(faq =>
          '<details><summary>' + escapeHtml(faq.q) + '</summary><p>' + escapeHtml(faq.a) + '</p></details>').join('');
      }

      const relatedHost = document.querySelector('#related-products');
      const relatedGrid = document.querySelector('#related-grid');
      if (relatedHost && relatedGrid) {
        const renderRelatedProducts = products => {
          const source = Array.isArray(products) ? products : [];
          const currentId = product.id == null ? '' : String(product.id);
          const candidates = source
            .map((item, position) => ({ item, position }))
            .filter(entry => entry.position !== index &&
              (!currentId || String(entry.item.id == null ? '' : entry.item.id) !== currentId) &&
              entry.item && entry.item.active !== false && entry.item.isActive !== false);
          const sameCategory = candidates.filter(entry => entry.item.category === product.category);
          const pool = (sameCategory.length ? sameCategory : candidates).slice(0, 4);
          /* Even a one-product catalogue should not leave an empty section. */
          const finalPool = pool.length ? pool : source.map((item, position) => ({ item, position })).slice(0, 4);

          if (!finalPool.length) {
            relatedHost.hidden = true;
            return;
          }
          relatedHost.hidden = false;
          relatedGrid.innerHTML = finalPool.map(({ item, position }) => {
            const image = item.image || Store.IMAGE.fallback;
            const price = Number(item.price) || 0;
            return `<article class="product-card related-product-card">
              <div class="product-image">
                <a class="product-link" href="product.html?product=${position}" aria-label="View ${escapeHtml(item.name)}">
                  <img src="${escapeHtml(image)}" alt="${escapeHtml(item.name)}" loading="lazy" decoding="async">
                </a>
                ${wishlistButton(position)}
                ${item.tag ? `<span class="product-badge">${escapeHtml(item.tag)}</span>` : ''}
                <button class="quick-add" data-product="${position}">View product <span>+</span></button>
              </div>
              <div class="product-details">
                <div>
                  <h3><a href="product.html?product=${position}">${escapeHtml(item.name)}</a></h3>
                  <p>Solids / ${escapeHtml(productLabel(item))}</p>
                </div>
                <span class="product-price">${money(price)}</span>
              </div>
            </article>`;
          }).join('');
          relatedGrid.querySelectorAll('.quick-add').forEach(button => button.addEventListener('click', () => {
            window.location.href = `product.html?product=${Number(button.dataset.product)}`;
          }));
        };

        /* Product detail already waits for productsReady, so use that same
           catalogue and its indices for recommendation links. Product records
           do not have an active flag; filtering on one hid valid products. */
        renderRelatedProducts(Store.state.products);
      }

      update();
    }
  }

  /* ------------------------------------------------- contact & shop banner */

  /* The banner above the product grid used to be hard-coded in the HTML, so the
     one an admin set as active in "Categories & banners" never showed up on the
     shop page. It is rendered here from the store instead — the markup below is
     the same shape the page shipped with, so the existing CSS still applies. */
  const renderShopBanner = () => {
    const host = document.querySelector('.all-banner');
    if (!host) return;
    const banner = Store.activeBanner();
    if (!banner) return;
    const image = banner.image || Store.IMAGE.banner;
    host.innerHTML = `
      <img src="${escapeAttr(image)}" alt="${escapeAttr(banner.title || 'Shop the edit')}">
      <div>
        <span>Solids</span>
        <strong>${escapeHtml(banner.title || '')}</strong>
        ${banner.subtitle ? `<em>${escapeHtml(banner.subtitle)}</em>` : ''}
      </div>`;
  };

  /* The floating WhatsApp button and the footer phone line both read the same
     admin-editable number, so a change in the admin panel reaches the whole
     site at once. */
  const applyContact = () => {
    const config = Store.state.shipping;
    const digits = String(config.whatsappNumber || '').replace(/\D/g, '');
    if (!digits) return;

    const pretty = '+' + digits.replace(/^(\d{2})(\d{3})(\d{3,})(\d{4})$/, '$1 $2 $3 $4');

    document.querySelectorAll('[data-footer-phone]').forEach(node => {
      node.textContent = 'WhatsApp: ' + pretty;
    });
    document.querySelectorAll('[data-instagram]').forEach(node => {
      if (config.instagramUrl) node.href = config.instagramUrl;
    });

    let button = document.querySelector('.whatsapp-float');
    if (!button) {
      button = document.createElement('a');
      button.className = 'whatsapp-float';
      button.target = '_blank';
      button.rel = 'noopener';
      button.setAttribute('aria-label', 'Chat with us on WhatsApp');
      button.innerHTML = `
        <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
          <path fill="currentColor" d="M16 3C8.83 3 3 8.83 3 16c0 2.29.6 4.44 1.67 6.29L3 29l6.87-1.64A12.94 12.94 0 0 0 16 29c7.17 0 13-5.83 13-13S23.17 3 16 3Zm0 23.6c-2.06 0-4.06-.59-5.77-1.7l-.41-.27-4.08.98.98-3.98-.28-.41a10.55 10.55 0 0 1-1.62-5.62c0-5.87 4.78-10.65 10.66-10.65S26.6 8.55 26.6 14.4 21.86 26.6 16 26.6Zm5.8-7.99c-.32-.16-1.88-.93-2.17-1.03-.29-.11-.5-.16-.71.16-.21.31-.82 1.02-1 1.23-.19.21-.37.24-.69.08-.32-.16-1.34-.5-2.56-1.58-.94-.84-1.58-1.88-1.77-2.2-.18-.32-.02-.49.14-.65.15-.15.32-.37.48-.56.16-.19.21-.32.32-.53.11-.21.05-.4-.03-.56-.08-.16-.71-1.73-.98-2.36-.26-.62-.52-.54-.71-.55h-.61c-.21 0-.56.08-.85.4-.29.32-1.11 1.09-1.11 2.66s1.14 3.08 1.3 3.29c.16.21 2.25 3.43 5.45 4.81.76.33 1.35.52 1.81.67.76.24 1.45.21 2 .13.61-.09 1.88-.77 2.14-1.51.27-.74.27-1.38.19-1.51-.08-.13-.29-.21-.61-.37Z"/>
        </svg>`;
      document.body.appendChild(button);
    }
    button.href = `https://wa.me/${digits}`;
  };

  const setupCustomOrderForm = () => {
    const form = document.querySelector('#custom-order-form');
    if (!form) return;

    const garmentSelect = form.querySelector('#custom-garment');
    Store.state.products.forEach(product => {
      const option = document.createElement('option');
      option.value = product.name;
      option.textContent = product.name;
      garmentSelect.appendChild(option);
    });

    const colorSelect = form.querySelector('#custom-color');
    /* Offer the colours the studio actually saved on its products. */
    const availableColors = [];
    Store.state.products.forEach(product => {
      (product.colors || []).forEach(name => {
        if (name && availableColors.indexOf(name) === -1) availableColors.push(name);
      });
    });
    availableColors.forEach(name => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      colorSelect.appendChild(option);
    });

    const deadline = form.querySelector('[name="deadline"]');
    const today = new Date();
    deadline.min = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    form.addEventListener('submit', event => {
      event.preventDefault();
      const digits = String(Store.state.shipping.whatsappNumber || '').replace(/\D/g, '');
      if (!/^\d{8,15}$/.test(digits)) {
        notify('WhatsApp contact is unavailable. Please contact the studio directly.');
        return;
      }

      const values = new FormData(form);
      const message = [
        'Hello Solids! I would like to request a custom order.',
        '',
        `Name: ${values.get('name')}`,
        `WhatsApp: ${values.get('phone')}`,
        `Email: ${values.get('email') || 'Not provided'}`,
        `Garment/product: ${values.get('garment')}`,
        `Preferred colour: ${values.get('color') || 'Not sure yet'}`,
        `Usual size: ${values.get('size') || 'Not provided'}`,
        `Measurements: ${values.get('measurements') || 'Not provided'}`,
        `Custom details: ${values.get('details')}`,
        `Budget: ${values.get('budget') || 'Not provided'}`,
        `Needed by: ${values.get('deadline') || 'Flexible'}`
      ].join('\n');

      const link = document.createElement('a');
      link.href = `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      link.remove();
    });
  };

  /* --------------------------------------------------------------- boot */

  syncFilterButtons();
  setupCollectionsDropdown();
  applyContent();
  renderCollections();
  updateCart();
  renderShopBanner();
  applyContact();
  setupCustomOrderForm();

  const requested = new URLSearchParams(window.location.search).get('category');
  currentFilter = requested && requested !== 'all' ? requested : 'all';
  if (requested) {
    const match = Store.state.categories.filter(category => slugify(category) === requested)[0];
    if (match) {
      const heading = document.querySelector('.all-heading h2');
      if (heading) heading.textContent = match;
      const crumb = document.querySelector('.breadcrumbs span:last-child');
      if (crumb) crumb.textContent = match;
    }
  }
  setActiveFilter(currentFilter);
  renderProducts(currentFilter);

  const collectionCount = document.querySelector('.catalog-collection-card p');
  if (collectionCount) collectionCount.textContent = Store.state.products.length + ' products';

  if (!document.querySelector('script[data-customer-module]')) {
    const customerModule = document.createElement('script');
    customerModule.src = 'customer.js';
    customerModule.dataset.customerModule = '';
    document.body.appendChild(customerModule);
  }
})();
