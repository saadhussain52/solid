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
  try { cart = JSON.parse(localStorage.getItem('solids-cart') || '[]') || []; } catch (error) { cart = []; }

  const saveCart = () => {
    try { localStorage.setItem('solids-cart', JSON.stringify(cart)); } catch (error) { /* ignore */ }
  };

  const productLabel = product => Store.categoryName(product.category);
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
        <img src="${escapeHtml(collectionImage(collection))}" alt="${escapeHtml(collection.name)}">
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
        const low = units > 0 && units <= 10;
        return `<article class="product-card${status.key === 'sold-out' ? ' is-sold-out' : ''}">
          <div class="product-image">
            <a class="product-link" href="product.html?product=${index}" aria-label="View ${escapeHtml(product.name)}">
              <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}">
            </a>
            ${product.tag ? `<span class="product-badge">${escapeHtml(product.tag)}</span>` : ''}
            ${status.key === 'sold-out' ? '<span class="sold-out-flag">Sold out</span>' : ''}
            ${low ? `<span class="low-stock-flag">Only ${units} left</span>` : ''}
            <button class="quick-add" data-product="${index}"${status.key === 'sold-out' ? ' disabled' : ''}>
              ${status.key === 'sold-out' ? 'Sold out' : 'Add to bag <span>+</span>'}
            </button>
          </div>
          <div class="product-details">
            <div>
              <h3><a href="product.html?product=${index}">${escapeHtml(product.name)}</a></h3>
              <p>Solids / ${escapeHtml(productLabel(product))}${low ? ` · ${units} left` : ''}</p>
            </div>
            <span class="product-price">${Store.priceRange(product)}</span>
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
  const cartKey = item => `${item.productIndex}::${item.size || ''}::${item.color || ''}`;

  function addToCart(item) {
    const product = Store.state.products[item.productIndex];
    if (!product) return;
    if (item.size) {
      if (Store.stockFor(product, item.size) <= 0) { notify(`${product.name} — ${item.size} is sold out`); return; }
    } else if (Store.totalStock(product) <= 0) {
      notify(`${product.name} is sold out`);
      return;
    }
    const key = cartKey(item);
    const existing = cart.filter(line => cartKey(line) === key)[0];
    const inBag = existing ? existing.quantity : 0;
    const available = item.size ? Store.stockFor(product, item.size) : Store.totalStock(product);
    if (inBag >= available) { notify(`Only ${available} left in ${item.size || product.name}`); return; }
    if (existing) existing.quantity += 1;
    else cart.push({ productIndex: item.productIndex, size: item.size, color: item.color || '', quantity: 1 });
    saveCart();
    updateCart();
    openDrawer('cart-drawer');
  }

  function cartLines() {
    return cart.map(line => {
      const product = Store.state.products[line.productIndex];
      if (!product) return null;
      const price = line.size ? Store.priceFor(product, line.size) : numOr(product.price);
      return { line, product, price, total: price * line.quantity };
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
        <img src="${escapeHtml(entry.product.image)}" alt="${escapeHtml(entry.product.name)}">
        <div>
          <h4>${escapeHtml(entry.product.name)}</h4>
          <p>${entry.line.color ? `${escapeHtml(entry.line.color)} · ` : `<a href="product.html?product=${entry.line.productIndex}">Choose colour</a> · `}${entry.line.size ? `Size ${escapeHtml(entry.line.size)} · ` : ''}${money(entry.price)} × ${entry.line.quantity}</p>
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
      const available = line.size ? Store.stockFor(product, line.size) : Store.totalStock(product);
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
        <img src="${escapeAttr(entry.product.image || '')}" alt="">
        <div>
          <strong>${escapeHtml(entry.product.name)}</strong>
          <span>${entry.line.color ? `${escapeHtml(entry.line.color)} · ` : 'Colour not selected · '}${escapeHtml(entry.line.size || 'Size not selected')} · Qty ${entry.line.quantity}</span>
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
      color: entry.line.color || '',
      size: entry.line.size || '',
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

    const submit = modal.querySelector('#co-submit');
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
          local.sent = !!result.emailSent;
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
    if (modal) modal.classList.remove('show');
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
      </div>` : `
      <div class="confirm-block">
        <p class="eyebrow">CASH ON DELIVERY</p>
        <p class="confirm-note">Keep <strong>${money(total)}</strong> ready for the courier. Please have the exact amount if you can — it saves everyone a second trip.</p>
      </div>`;

    /* A static page cannot send mail on its own, so the order reaches the studio
       through the customer's own mail client — a pre-filled email to the
       studio's address. The tracking ID is in the subject and the customer
       keeps a copy, because the studio cannot mail them a confirmation. */
    /* The one tracking link for this order. origin carries no trailing slash, so
       it has to be added here or every link comes out as
       localhost:5173track.html and 404s the moment the customer clicks it.
       The server's copy wins when it answered, because that is the URL it
       put in the email the customer actually received. */
    const trackUrl = order.trackUrl
      || window.location.origin + window.location.pathname.replace(/[^/]*$/, '') + 'track.html?id=' + encodeURIComponent(order.trackingId);

    const emailSubject = `New order ${order.id} — tracking ${order.trackingId}`;
    const emailBody = [
      `New order from ${config.supportEmail}`,
      '',
      `Order:       ${order.id}`,
      `Tracking ID: ${order.trackingId}`,
      `Customer:    ${order.customer}`,
      `Phone:       ${order.phone}`,
      `Email:       ${order.email}`,
      `Address:     ${order.address}${order.city ? ', ' + order.city : ''}`,
      `Notes:       ${order.notes || '—'}`,
      `Payment:     ${payment}`,
      '',
      'Items:',
      ...order.items.map(item => `  ${item.qty} × ${item.name} (${[item.color || 'Colour not recorded', item.size || 'Size not recorded'].join(' / ')}) — ${money(item.price * item.qty)}`),
      '',
      `Subtotal: ${money(quote.subtotal || 0)}`,
      `${chargeLabel}${order.city ? ' (' + order.city + ')' : ''}: ${chargeAmount}`,
      `TOTAL: ${money(total)} PKR`,
      '',
      `Track: ${trackUrl}`
    ].filter(Boolean).join('\n');
    const mailtoHref = `mailto:${config.supportEmail}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;

    /* A static page has no mail server, so nothing reaches the customer
       unless they send it themselves. This block is the confirmation they
       would have received, offered as plain text to copy — which is where
       the order number actually reaches the customer. */
    const orderNote = [
      `Solids — order ${order.id}`,
      `Tracking ID: ${order.trackingId}`,
      `Placed: ${order.date}`,
      `Payment: ${payment}`,
      'Items:',
      ...order.items.map(item => `  ${item.qty} × ${item.name} (${[item.color || 'Colour not recorded', item.size || 'Size not recorded'].join(' / ')}) — ${money(item.price * item.qty)}`),
      `Total: ${money(total)} PKR`,
      `Track: ${trackUrl}`
    ].join('\n');

    /* Save-to-file without a library: hands the customer a .txt they can
       keep, standing in for the receipt this site cannot email. */
    const saveOrderFile = () => {
      const blob = new Blob([orderNote], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `solids-${order.id.replace('#', '')}-${order.trackingId}.txt`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      /* Revoked immediately it can cancel the download in some browsers, so
         let the click land first. */
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify('Order details saved — keep the order number for tracking');
    };

    const copyOrderDetails = async () => {
      try {
        await navigator.clipboard.writeText(orderNote);
        notify('Order details copied — order number included');
      } catch (error) {
        /* Clipboard needs a secure context or permission, so fall back to
           selecting the text for the customer to copy by hand. */
        const area = modal.querySelector('#confirm-plain');
        if (!area) return;
        area.hidden = false;
        area.focus();
        area.select();
        notify('Press Ctrl/Cmd + C to copy your order number');
      }
    };

    /* The tracking link is the one thing that must survive the screen closing,
       so it is shown as a real, selectable URL with its own copy button rather
       than hidden inside the "Track this order" button. Email may not arrive
       (or the customer may open the site on another device), and this is what
       they paste into a message or onto another device. */
    const trackBlock = `
      <div class="confirm-link">
        <p class="eyebrow">YOUR TRACKING LINK</p>
        <a class="confirm-link-url" href="${escapeAttr(trackUrl)}">${escapeHtml(trackUrl)}</a>
        <div class="confirm-actions">
          <button type="button" class="button" data-copy-link>Copy link</button>
          <button type="button" class="button" data-copy-id>Copy tracking ID</button>
        </div>
        <p class="confirm-track-note">Open this link on any device to follow the parcel. You can also
          <a href="track.html">search by your email address</a> on the tracking page — no link needed.</p>
      </div>`;

    const copyText = async (text, message) => {
      try {
        await navigator.clipboard.writeText(text);
        notify(message);
      } catch (error) {
        /* Clipboard needs a secure context or permission. Fall back to a
           temporary textarea so the customer is never left without a way to
           get the link out. */
        const area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        try { document.execCommand('copy'); notify(message); }
        catch (err) { notify('Press Ctrl/Cmd + C to copy'); }
        area.remove();
      }
    };

    const modal = document.createElement('div');
    modal.className = 'store-modal show';
    modal.id = 'confirmation-modal';
    /* The server told us whether it actually managed to send mail. Promising an
       email that never arrived is what broke this screen before, so the wording
       branches on the real answer: either the link is in their inbox, or it is
       not and they need to send it themselves. */
    const mailed = !!order.sent;

    const deliveryBlock = mailed ? `
        <p class="confirm-track-note">We have emailed your tracking link to <strong>${escapeHtml(order.email)}</strong>. Open it on any device and paste your tracking ID to follow the parcel.</p>
        <div class="confirm-actions">
          <a class="button button-dark" href="${escapeAttr(trackUrl)}">Track this order &#8599;</a>
          <a class="button" href="track.html?id=${encodeURIComponent(order.trackingId)}">Open tracking page</a>
        </div>` : `
        <p class="confirm-track-note">The studio has not received this order yet, and this page cannot email it. Use the button below to send it — it opens your email app with everything filled in. <strong>Save your tracking link below</strong> so you can follow the parcel from any device.</p>
        <div class="confirm-actions">
          <a class="button button-dark" href="${escapeAttr(trackUrl)}">Track this order &#8599;</a>
          <a class="button confirm-send" href="${escapeAttr(mailtoHref)}">Send order to ${escapeHtml(config.supportEmail)} &#8599;</a>
        </div>`;

    modal.innerHTML = `
      <div class="store-modal-card confirm-card">
        <p class="eyebrow">ORDER CONFIRMED</p>
        <h3>Thank you, ${escapeHtml(order.customer)}</h3>
        <p class="confirm-sub">Thank you — your order is saved. <strong>Your order number is ${escapeHtml(order.id)}</strong>${order.city ? `, and we are delivering to ${escapeHtml(order.city)}` : ''}.</p>

        <div class="confirm-track">
          <div><span>Order</span><strong>${escapeHtml(order.id)}</strong></div>
          <div><span>Tracking ID</span><strong>${escapeHtml(order.trackingId)}</strong></div>
        </div>

        ${deliveryBlock}

        <div class="confirm-actions">
          <button type="button" class="button" data-copy-order>Copy order details</button>
          <button type="button" class="button" data-save-order>Save as file</button>
        </div>
        <textarea id="confirm-plain" class="confirm-plain" readonly hidden aria-label="Your order details">${escapeHtml(orderNote)}</textarea>

        ${trackBlock}

        <div class="confirm-items">
          ${(order.items || []).map(item => `<div><span>${escapeHtml(item.name)} · ${escapeHtml(item.color || 'Colour not recorded')} · ${escapeHtml(item.size || 'Size not recorded')} × ${item.qty}</span><em>${money(item.price * item.qty)}</em></div>`).join('')}
        </div>

        <div class="co-charges">
          <div class="co-charge"><span>Subtotal</span><em>${money(quote.subtotal || 0)}</em></div>
          <div class="co-charge${quote.waived ? ' is-free' : ''}"><span>${escapeHtml(chargeLabel)}${quote.isLocalCity && order.city ? ' to ' + escapeHtml(order.city) : ''}</span><em>${chargeAmount}</em></div>
          <div class="co-total"><span>Total</span><strong>${money(Store.orderTotal(order))}</strong></div>
        </div>

        ${instructions}

        <div class="modal-actions">
          <button type="button" class="button" data-track-order="${escapeAttr(order.trackingId)}">Track this order</button>
          <button type="button" class="button button-dark" data-confirm-close>Done</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    modal.addEventListener('click', event => {
      if (event.target === modal || event.target.closest('[data-confirm-close]')) modal.remove();
      const track = event.target.closest('[data-track-order]');
      if (track) { modal.remove(); window.location.href = 'track.html?id=' + encodeURIComponent(track.dataset.trackOrder); }
      if (event.target.closest('[data-copy-order]')) copyOrderDetails();
      if (event.target.closest('[data-save-order]')) saveOrderFile();
      /* The tracking link and ID are the two things a customer needs to keep,
         so both get a one-tap copy. copyText falls back to a hidden textarea
         when the clipboard API is unavailable, so neither button can dead-end. */
      if (event.target.closest('[data-copy-link]')) {
        copyText(trackUrl, 'Tracking link copied — paste it anywhere');
      }
      if (event.target.closest('[data-copy-id]')) {
        copyText(order.trackingId, 'Tracking ID copied');
      }
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
      return `<a class="search-result" href="product.html?product=${index}">${escapeHtml(product.name)}<span>${Store.priceRange(product)}</span></a>`;
    }).join('') || '<p class="muted">No matches found.</p>';
  });

  document.querySelector('#newsletter-form')?.addEventListener('submit', event => {
    event.preventDefault();
    event.target.innerHTML = '<p style="color:#d9c1ae;font-size:12px">You are on the list. Welcome in.</p>';
  });

  /* ------------------------------------------------------- product detail page */

  const COLOR_PALETTE = [
    ['Snow', '#fffafa'], ['Ivory', '#f4efe4'], ['Bone', '#e8e2d6'], ['Oat', '#ded2bf'], ['Sand', '#d6c3a5'],
    ['Beige', '#d8c3a5'], ['Taupe', '#aa9985'], ['Mushroom', '#a39283'], ['Mocha', '#806654'], ['Cocoa', '#65483c'],
    ['Chocolate', '#4a3026'], ['Espresso', '#33231d'], ['Black', '#1b1a19'], ['Charcoal', '#3b3a38'], ['Slate', '#62666a'],
    ['Ash Grey', '#858585'], ['Grey', '#a4a29e'], ['Silver', '#c3c1bc'], ['Cloud', '#d7d8d6'], ['White', '#f7f6f3'],
    ['Stone', '#b6ad9e'], ['Khaki', '#b3a685'], ['Camel', '#b58d62'], ['Tan', '#c9a882'], ['Caramel', '#ad754b'],
    ['Rust', '#a4552f'], ['Terracotta', '#c66b4e'], ['Burnt Orange', '#b95424'], ['Orange', '#e17b32'], ['Apricot', '#edaa78'],
    ['Peach', '#f0b6a1'], ['Coral', '#e77c70'], ['Red', '#b4403a'], ['Brick', '#913c35'], ['Cherry', '#9e2038'],
    ['Burgundy', '#5d2733'], ['Maroon', '#71333d'], ['Wine', '#6e3045'], ['Berry', '#8e3e65'], ['Fuchsia', '#c43b83'],
    ['Hot Pink', '#e84a91'], ['Pink', '#d7a8ad'], ['Blush', '#e8c1bd'], ['Rose', '#c98b93'], ['Dusty Rose', '#bd8f91'],
    ['Mauve', '#a77d8e'], ['Lilac', '#b3a3c2'], ['Lavender', '#a995c8'], ['Violet', '#76538c'], ['Purple', '#5f4a6b'],
    ['Plum', '#59364f'], ['Indigo', '#43436b'], ['Navy', '#26303f'], ['Midnight Blue', '#17243a'], ['Royal Blue', '#3559a5'],
    ['Blue', '#4a6b8a'], ['Sky Blue', '#80b6d5'], ['Powder Blue', '#b4d0db'], ['Teal', '#287f83'], ['Turquoise', '#45b7ad'],
    ['Aqua', '#8acbc4'], ['Mint', '#a4d2ba'], ['Sage', '#a8b39a'], ['Olive', '#5f6b4a'], ['Moss', '#65734c'],
    ['Forest Green', '#315b45'], ['Green', '#4f6b52'], ['Emerald', '#2e8065'], ['Lime', '#a9b94a'], ['Chartreuse', '#b4b846'],
    ['Mustard', '#c39a3c'], ['Yellow', '#e3c64f'], ['Lemon', '#f0df76'], ['Gold', '#c2a25a'], ['Copper', '#a96a42']
  ];

  const detailImage = document.querySelector('#detail-image');
  if (detailImage) {
    const index = Number(new URLSearchParams(window.location.search).get('product')) || 0;
    const product = Store.state.products[index] || Store.state.products[0];
    if (product) {
      const quantityEl = document.querySelector('#quantity-value');
      const gallery = document.querySelector('#detail-gallery');
      let galleryIndex = 0;

      const sizes = product.sizes || [];
      const sizeRow = document.querySelector('.size-options');
      if (sizeRow) {
        sizeRow.innerHTML = sizes.map(size => {
          const out = size.stock <= 0;
          return `<button data-size="${escapeHtml(size.label)}" class="${out ? 'sold-out' : ''}"${out ? ' disabled' : ''} title="${out ? 'Out of stock' : size.stock + ' in stock'}">${escapeHtml(size.label)}</button>`;
        }).join('');
      }

      const firstAvailable = sizes.filter(size => size.stock > 0)[0];
      const selectedSize = () => {
        const active = document.querySelector('.size-options button.selected');
        return active ? active.dataset.size : (firstAvailable ? firstAvailable.label : (sizes[0] ? sizes[0].label : ''));
      };

      /* The storefront owns its fixed palette; admin product colour text does
         not limit which colours a customer can select. */
      const colors = COLOR_PALETTE.map(([name]) => name);
      const colorRow = document.querySelector('#color-options');
      const colorLabel = document.querySelector('#selected-color');
      const colorField = colorRow?.closest('.color-row');
      const colorToggle = document.createElement('button');
      colorToggle.type = 'button';
      colorToggle.className = 'color-picker-toggle';
      colorToggle.id = 'color-picker-toggle';
      colorToggle.setAttribute('aria-expanded', 'false');
      colorToggle.setAttribute('aria-controls', 'color-options');
      if (colorField && colorRow && colorLabel) {
        const caption = document.createElement('span');
        caption.textContent = 'Choose colour: ';
        const oldLabel = colorLabel.parentElement;
        colorToggle.append(caption, colorLabel);
        oldLabel.remove();
        colorField.insertBefore(colorToggle, colorRow);
        colorRow.hidden = true;
        colorField.querySelector('.color-preview-note')?.remove();
      }
      if (colorRow) {
        colorRow.innerHTML = COLOR_PALETTE.map(([color, hex]) =>
          `<button type="button" class="color-swatch" data-color="${escapeAttr(color)}" title="${escapeAttr(color)}" aria-label="${escapeAttr(color)}" style="--swatch:${hex}"></button>`).join('');
      }
      const selectedColor = () => {
        const active = colorRow && colorRow.querySelector('.color-swatch.selected');
        if (active) return active.dataset.color;
        return colors[0];
      };
      const paintColors = () => {
        const chosen = selectedColor();
        if (colorLabel) colorLabel.textContent = chosen || '—';
        if (colorToggle) colorToggle.style.setProperty('--selected-swatch', COLOR_PALETTE.find(([name]) => name === chosen)?.[1] || '#a4a29e');
        colorRow?.querySelectorAll('.color-swatch').forEach(button => {
          button.classList.toggle('selected', button.dataset.color === chosen);
        });
      };
      const closeColorPicker = () => {
        if (!colorRow || !colorToggle) return;
        colorRow.hidden = true;
        colorToggle.setAttribute('aria-expanded', 'false');
      };
      if (colorRow) {
        colorRow.addEventListener('click', event => {
          const button = event.target.closest('.color-swatch');
          if (!button) return;
          colorRow.querySelectorAll('.color-swatch').forEach(item => item.classList.remove('selected'));
          button.classList.add('selected');
          paintColors();
          closeColorPicker();
        });
        colorToggle?.addEventListener('click', () => {
          const opening = colorRow.hidden;
          colorRow.hidden = !opening;
          colorToggle.setAttribute('aria-expanded', String(opening));
        });
        document.addEventListener('click', event => {
          if (!event.target.closest('.color-row')) closeColorPicker();
        });
        document.addEventListener('keydown', event => {
          if (event.key === 'Escape') closeColorPicker();
        });
        paintColors();
      }

      const update = () => {
        const label = selectedSize();
        const quantity = Number(quantityEl.textContent) || 1;
        const price = Store.priceFor(product, label);
        const stock = Store.stockFor(product, label);
        const priceEl = document.querySelector('#detail-price');
        if (priceEl) priceEl.textContent = money(price);
        const subtotalEl = document.querySelector('#detail-subtotal');
        if (subtotalEl) subtotalEl.textContent = money(price * quantity);
        const sizeLabel = document.querySelector('#selected-size');
        if (sizeLabel) sizeLabel.textContent = label || '—';
        const availability = document.querySelector('.availability strong');
        if (availability) availability.textContent = stock > 0 ? label + ' · ' + stock + ' in stock' : label + ' · Out of stock';
        sizeRow?.querySelectorAll('button').forEach(button => {
          button.classList.toggle('selected', button.dataset.size === label);
        });
      };

      const paintImage = () => {
        const gallerySources = product.gallery && product.gallery.length ? product.gallery : [product.image];
        detailImage.src = gallerySources[galleryIndex] || product.image;
        detailImage.alt = product.name;
        if (gallery) {
          gallery.innerHTML = gallerySources.map((source, position) =>
            `<button data-gallery="${position}" class="${position === galleryIndex ? 'active' : ''}"><img src="${escapeHtml(source)}" alt="${escapeHtml(product.name)} view ${position + 1}"></button>`).join('');
          gallery.querySelectorAll('[data-gallery]').forEach(button => button.addEventListener('click', () => {
            galleryIndex = Number(button.dataset.gallery);
            paintImage();
          }));
        }
      };
      paintImage();

      const nameEl = document.querySelector('#detail-name');
      if (nameEl) nameEl.textContent = product.name;
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
        const ceiling = Store.stockFor(product, label);
        if (Number(quantityEl.textContent) >= ceiling) { notify('Only ' + ceiling + ' available in ' + label); return; }
        quantityEl.textContent = Number(quantityEl.textContent) + 1;
        update();
      });
      document.querySelector('#minus')?.addEventListener('click', () => {
        quantityEl.textContent = Math.max(1, Number(quantityEl.textContent) - 1);
        update();
      });

      document.querySelector('.detail-add')?.addEventListener('click', () => {
        const label = selectedSize();
        if (Store.stockFor(product, label) <= 0) { notify(label + ' is out of stock'); return; }
        addToCart({ productIndex: index, size: label, color: selectedColor(), quantity: 1 });
      });
      document.querySelector('.buy-now')?.addEventListener('click', () => {
        const label = selectedSize();
        if (Store.stockFor(product, label) <= 0) { notify(label + ' is out of stock'); return; }
        addToCart({ productIndex: index, size: label, color: selectedColor(), quantity: 1 });
        window.setTimeout(openCheckout, 350);
      });

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
        const pool = Store.state.products
          .map((item, position) => ({ item, position }))
          .filter(entry => entry.position !== index)
          .sort((a, b) => {
            const scoreA = (a.item.category === product.category ? 2 : 0) + (a.item.tag === product.tag ? 1 : 0);
            const scoreB = (b.item.category === product.category ? 2 : 0) + (b.item.tag === product.tag ? 1 : 0);
            return scoreB - scoreA;
          })
          .slice(0, 4);

        if (pool.length) {
          relatedGrid.innerHTML = pool.map(({ item, position }) => {
            const status = Store.productStatus(item);
            const units = Store.totalStock(item);
            const low = units > 0 && units <= 10;
            return `<article class="product-card${status.key === 'sold-out' ? ' is-sold-out' : ''}">
              <div class="product-image">
                <a class="product-link" href="product.html?product=${position}" aria-label="View ${escapeHtml(item.name)}">
                  <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}">
                </a>
                ${item.tag ? `<span class="product-badge">${escapeHtml(item.tag)}</span>` : ''}
                ${status.key === 'sold-out' ? '<span class="sold-out-flag">Sold out</span>' : ''}
                ${low ? `<span class="low-stock-flag">Only ${units} left</span>` : ''}
                <button class="quick-add" data-product="${position}"${status.key === 'sold-out' ? ' disabled' : ''}>
                  ${status.key === 'sold-out' ? 'Sold out' : 'Add to bag <span>+</span>'}
                </button>
              </div>
              <div class="product-details">
                <div>
                  <h3><a href="product.html?product=${position}">${escapeHtml(item.name)}</a></h3>
                  <p>Solids / ${escapeHtml(productLabel(item))}${low ? ` · ${units} left` : ''}</p>
                </div>
                <span class="product-price">${Store.priceRange(item)}</span>
              </div>
            </article>`;
          }).join('');
          relatedGrid.querySelectorAll('.quick-add').forEach(button => button.addEventListener('click', () => {
            window.location.href = `product.html?product=${Number(button.dataset.product)}`;
          }));
        } else {
          relatedHost.hidden = true;
        }
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
    COLOR_PALETTE.forEach(([name]) => {
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
})();
