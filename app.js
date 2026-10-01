/*
 * Solids storefront behaviour.
 * Reads every product, size, price, image and text from the shared store
 * (store-data.js) so anything changed in the admin workspace appears here.
 */
(() => {
  'use strict';

  const Store = window.Store;
  if (!Store) return;

  const { money, slugify, escapeHtml } = Store;
  const grid = document.querySelector('#product-grid');
  const collectionGrid = document.querySelector('#collection-grid');
  let cart = [];
  try { cart = JSON.parse(localStorage.getItem('solids-cart') || '[]') || []; } catch (error) { cart = []; }

  const saveCart = () => {
    try { localStorage.setItem('solids-cart', JSON.stringify(cart)); } catch (error) { /* ignore */ }
  };

  const productLabel = product => Store.categoryName(product.category);

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
          <em>Shop now ↗</em>
        </div>
      </a>`).join('');
  };

  /* ------------------------------------------------------------- filters */

  const syncFilterButtons = () => {
    const row = document.querySelector('.filter-row, .catalog-sidebar');
    if (!row) return;
    row.querySelectorAll('[data-managed-filter]').forEach(button => button.remove());
    Store.state.categories.forEach(category => {
      if (category === 'New Arrivals') return;
      const slug = slugify(category);
      if (row.querySelector(`[data-filter="${slug}"]`)) return;
      const button = document.createElement('button');
      button.className = row.classList.contains('filter-row') ? 'filter' : 'catalog-filter';
      button.dataset.filter = slug;
      button.dataset.managedFilter = 'true';
      button.textContent = category;
      row.appendChild(button);
    });
    if (!row.querySelector('[data-filter="new-arrivals"]')) {
      const button = document.createElement('button');
      button.className = row.classList.contains('filter-row') ? 'filter' : 'catalog-filter';
      button.dataset.filter = 'new-arrivals';
      button.dataset.managedFilter = 'true';
      button.textContent = 'New Arrivals';
      row.insertBefore(button, row.firstChild);
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
      addToCart({ productIndex: Number(button.dataset.product), size: null, quantity: 1 });
    }));
    updateProductCount(filter);
  }

  const updateProductCount = filter => {
    const label = document.querySelector('#product-count');
    if (label) label.textContent = `${Store.state.products.filter(product => matches(product, filter)).length} products`;
  };

  /* --------------------------------------------------------------- cart */

  const cartKey = item => `${item.productIndex}::${item.size || ''}`;

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
    else cart.push({ productIndex: item.productIndex, size: item.size, quantity: 1 });
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
          <p>${entry.line.size ? `Size ${escapeHtml(entry.line.size)} · ` : ''}${money(entry.price)} × ${entry.line.quantity}</p>
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
    document.querySelector(`#${id}`)?.classList.add('open');
    document.querySelector('.scrim')?.classList.add('show');
  }
  const closeDrawers = () => {
    document.querySelectorAll('.search-panel,.cart-drawer').forEach(el => el.classList.remove('open'));
    document.querySelector('.scrim')?.classList.remove('show');
  };

  /* ---------------------------------------------------------- checkout */

  const CHECKOUT_FIELDS = [
    { id: 'co-name', label: 'Full name', type: 'text' },
    { id: 'co-email', label: 'Email', type: 'email' },
    { id: 'co-phone', label: 'Phone', type: 'tel' },
    { id: 'co-address', label: 'Delivery address', type: 'textarea' },
    { id: 'co-payment', label: 'Payment method', type: 'select', options: ['Cash on delivery', 'Card', 'Bank transfer'] }
  ];

  function buildCheckout() {
    if (document.querySelector('#checkout-modal')) return;
    const modal = document.createElement('div');
    modal.className = 'store-modal';
    modal.id = 'checkout-modal';
    modal.innerHTML = `
      <div class="store-modal-card">
        <button type="button" class="modal-close" data-close-checkout>×</button>
        <p class="eyebrow">SECURE CHECKOUT</p>
        <h3>Place your order</h3>
        <form id="checkout-form">
          ${CHECKOUT_FIELDS.map(field => {
            if (field.type === 'textarea') {
              return `<label>${field.label}<textarea id="${field.id}" rows="3" required></textarea></label>`;
            }
            if (field.type === 'select') {
              return `<label>${field.label}<select id="${field.id}">${field.options.map(option => `<option>${option}</option>`).join('')}</select></label>`;
            }
            return `<label>${field.label}<input id="${field.id}" type="${field.type}" required></label>`;
          }).join('')}
          <div class="checkout-summary" id="checkout-summary"></div>
          <div class="modal-actions">
            <button type="button" class="button" data-close-checkout>Cancel</button>
            <button type="submit" class="button button-dark">Confirm order ↗</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(modal);

    modal.querySelectorAll('[data-close-checkout]').forEach(button => button.addEventListener('click', () => modal.classList.remove('show')));
    modal.addEventListener('click', event => { if (event.target === modal) modal.classList.remove('show'); });
    modal.querySelector('#checkout-form').addEventListener('submit', event => {
      event.preventDefault();
      const lines = cartLines();
      if (!lines.length) { notify('Your bag is empty'); return; }
      const payment = modal.querySelector('#co-payment').value;
      const order = Store.createOrder({
        customer: modal.querySelector('#co-name').value.trim(),
        email: modal.querySelector('#co-email').value.trim(),
        phone: modal.querySelector('#co-phone').value.trim(),
        address: modal.querySelector('#co-address').value.trim(),
        payment,
        status: payment === 'Cash on delivery' ? 'Pending' : 'Paid',
        items: lines.map(entry => ({
          name: entry.product.name,
          size: entry.line.size || '',
          qty: entry.line.quantity,
          price: entry.price
        }))
      });
      cart = [];
      saveCart();
      updateCart();
      closeDrawers();
      modal.classList.remove('show');
      notify(`Order ${order.id} placed — thank you!`);
      renderProducts(currentFilter);
    });
  }

  const openCheckout = () => {
    buildCheckout();
    const summary = document.querySelector('#checkout-summary');
    if (summary) {
      const lines = cartLines();
      const total = lines.reduce((sum, entry) => sum + entry.total, 0);
      const units = lines.reduce((sum, entry) => sum + entry.line.quantity, 0);
      summary.innerHTML = `<span>${units} item${units === 1 ? '' : 's'}</span><strong>${money(total)}</strong>`;
    }
    document.querySelector('#checkout-modal').classList.add('show');
  };

  /* ------------------------------------------------- storefront filters */

  let currentFilter = 'all';

  document.querySelectorAll('.filter, .catalog-filter').forEach(button => button.addEventListener('click', () => {
    const filter = button.dataset.filter || 'all';
    currentFilter = filter;
    setActiveFilter(filter);
    renderProducts(filter);
  }));

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

  /* ------------------------------------------------- product detail page */

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
      if (tagEl) tagEl.textContent = product.tag || 'Solids';
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
        addToCart({ productIndex: index, size: label, quantity: 1 });
      });
      document.querySelector('.buy-now')?.addEventListener('click', () => {
        const label = selectedSize();
        if (Store.stockFor(product, label) <= 0) { notify(label + ' is out of stock'); return; }
        addToCart({ productIndex: index, size: label, quantity: 1 });
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
            addToCart({ productIndex: Number(button.dataset.product), size: null, quantity: 1 });
          }));
        } else {
          relatedHost.hidden = true;
        }
      }

      update();
    }
  }

  /* --------------------------------------------------------------- boot */

  syncFilterButtons();
  applyContent();
  renderCollections();
  updateCart();

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
