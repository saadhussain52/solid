/*
 * Solids admin workspace — shared behaviour for every dashboard page.
 * All writes go through Store (store-data.js) so the storefront updates instantly.
 */
(() => {
  'use strict';

  const Store = window.Store;
  if (!Store) return;

  const { money, slugify, escapeHtml } = Store;

  /* ------------------------------------------------------------ helpers */

  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));

  function toast(message) {
    let element = $('#admin-toast');
    if (!element) {
      element = document.createElement('div');
      element.id = 'admin-toast';
      element.className = 'toast';
      document.body.appendChild(element);
    }
    element.textContent = message;
    element.classList.add('show');
    window.clearTimeout(toast.timer);
    toast.timer = window.setTimeout(() => element.classList.remove('show'), 2400);
  }
  window.pageToast = toast;

  const readImage = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  /* ------------------------------------------------------- admin shell */

  function initShell() {
    const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase();
    const dateEl = $('.admin-topbar .eyebrow');
    if (dateEl) dateEl.textContent = today;

    const nav = $('.admin-sidebar nav');
    const counts = {
      'products.html': Store.state.products.length,
      'orders.html': Store.state.orders.length,
      'categories.html': Store.state.collections.length,
      'customers.html': Store.state.users.length
    };
    $$('.admin-nav[href]').forEach(link => {
      const file = link.getAttribute('href');
      if (counts[file] === undefined) return;
      let badge = link.querySelector('.nav-count');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'nav-count';
        link.appendChild(badge);
      }
      badge.textContent = counts[file];
    });
    if (nav && window.ADMIN_PAGE) {
      $$('.admin-nav').forEach(link => link.classList.remove('active'));
      const active = nav.querySelector(`[href="${window.ADMIN_PAGE}"]`);
      if (active) active.classList.add('active');
    }
    initSidebar();
  }

  /* ----------------------------------------------------------- sidebar

     The workspace sidebar is a permanent left rail at every width — the same
     pinned column on a phone as on a laptop. It used to collapse into an
     off-canvas drawer below 900px, which needed a fixed hamburger that landed
     on top of the logo. Nothing to wire up now, but any toggle/scrim left in
     the markup (or an `open` class from a previous session) is cleared so the
     rail can never be pushed off-screen. */

  function initSidebar() {
    $('.admin-sidebar')?.classList.remove('open');
    $$('#sidebar-toggle, .admin-sidebar-scrim').forEach(el => el.remove());
  }

  /* A storage problem must not be a toast that vanishes after two seconds — the
     admin needs to know their product did NOT save, so this banner stays up. */
  function storageBanner() {
    let element = $('#storage-warning');
    if (!element) {
      element = document.createElement('div');
      element.id = 'storage-warning';
      element.className = 'storage-warning';
      document.body.appendChild(element);
    }
    const paint = message => {
      element.textContent = message || '';
      element.classList.toggle('show', Boolean(message));
    };
    paint(Store.storageError && Store.storageError());
    Store.onStorageError(paint);
    return paint;
  }
  window.storageBanner = storageBanner;

  /* -------------------------------------------------------- image picker */

  /**
   * Turns a label + hidden input into an image picker with preview + paste support.
   */
  function imagePicker(options) {
    const { label, hint, value, onChange, previewClass = 'picker-preview' } = options;
    const wrap = document.createElement('div');
    wrap.className = 'picker';
    wrap.innerHTML = `
      <div class="${previewClass}"><img alt=""></div>
      <div class="picker-actions">
        <span class="picker-label">${escapeHtml(label)}</span>
        <small class="file-help">${escapeHtml(hint || 'Choose a file, drop one here, or paste an image')}</small>
        <div class="picker-buttons">
          <button type="button" class="button button-small" data-pick>Upload image</button>
          <button type="button" class="button button-small ghost" data-clear>Remove</button>
        </div>
        <input type="hidden" data-image-value value="${escapeHtml(value || '')}">
        <input type="file" accept="image/*" data-image-file hidden>
      </div>`;
    const img = wrap.querySelector('img');
    const hidden = wrap.querySelector('[data-image-value]');
    const fileInput = wrap.querySelector('[data-image-file]');

    const paint = source => { img.src = source || ''; img.parentElement.classList.toggle('has-image', Boolean(source)); };
    paint(value);

    const accept = async file => {
      if (!file || !file.type.startsWith('image/')) { toast('Please choose an image file'); return; }
      try {
        const data = await readImage(file);
        hidden.value = data;
        paint(data);
        onChange(data);
      } catch (error) {
        toast('Could not read that image. Please try another file.');
      }
    };

    wrap.querySelector('[data-pick]').addEventListener('click', () => fileInput.click());
    wrap.addEventListener('dragover', event => { event.preventDefault(); wrap.classList.add('dragging'); });
    wrap.addEventListener('dragleave', () => wrap.classList.remove('dragging'));
    wrap.addEventListener('drop', event => {
      event.preventDefault();
      wrap.classList.remove('dragging');
      accept(event.dataTransfer.files[0]);
    });
    wrap.addEventListener('paste', event => {
      const item = Array.from(event.clipboardData.items).filter(entry => entry.type.startsWith('image/'))[0];
      if (item) accept(item.getAsFile());
    });
    fileInput.addEventListener('change', () => accept(fileInput.files[0]));
    wrap.querySelector('[data-clear]').addEventListener('click', () => {
      hidden.value = '';
      paint('');
      onChange('');
    });

    return { element: wrap, get value() { return hidden.value; } };
  }

  /* --------------------------------------------------------- product editor */

  async function cloudifyProductImages(product, cache) {
    const upload = async source => {
      if (typeof source !== 'string' || !source.startsWith('data:image/')) return source;
      if (!cache.has(source)) cache.set(source, await Store.api.uploadImage(source));
      return cache.get(source);
    };
    product.image = await upload(product.image);
    product.gallery = await Promise.all((product.gallery || []).map(upload));
    for (const field of ['colorImages', 'colorMasks']) {
      const images = product[field] || {};
      for (const key of Object.keys(images)) images[key] = await upload(images[key]);
      product[field] = images;
    }
    return product;
  }

  async function cloudifyProducts(products) {
    const cache = new Map();
    for (const product of products) await cloudifyProductImages(product, cache);
    return products;
  }

  function clearLocalProductCache() {
    try { localStorage.removeItem(Store.KEYS.products); } catch (error) {
      throw new Error('Products were saved to Railway, but this browser could not clear its old product-image cache.');
    }
  }

  const SIZE_PRESETS = Store.SIZE_PRESETS;

  function sizeRows(sizes) {
    return `<div class="size-table">
      <div class="size-table-head"><span>SIZE</span><span>IN STOCK</span><span>UNIT COST (Rs.)</span><span>SELL PRICE (Rs.)</span><span>SOLD</span><span></span></div>
      <div data-size-rows>
        ${sizes.map((size, index) => sizeRowHtml(size, index)).join('')}
      </div>
      <div class="size-table-foot">
        <button type="button" class="button button-small" data-add-size>Add size</button>
        <select data-size-preset class="size-preset">
          <option value="">Add from preset…</option>
          ${Object.keys(SIZE_PRESETS).map(preset => `<option value="${preset}">${preset}</option>`).join('')}
        </select>
        <span class="size-totals" data-size-totals></span>
      </div>
    </div>`;
  }

  function sizeRowHtml(size, index) {
    const out = Number(size.stock) <= 0;
    // Each field carries its own label so the stacked mobile layout stays readable.
    return `<div class="size-row${out ? ' is-out' : ''}" data-size-row="${index}">
      <label class="size-field size-field-label"><span>SIZE</span><input data-size-label value="${escapeHtml(size.label)}" placeholder="Size"></label>
      <label class="size-field"><span>IN STOCK</span><input type="number" min="0" data-size-stock value="${Number(size.stock) || 0}"></label>
      <label class="size-field"><span>UNIT COST (Rs.)</span><input type="number" min="0" data-size-cost value="${Number(size.cost) || 0}"></label>
      <label class="size-field"><span>SELL PRICE (Rs.)</span><input type="number" min="0" data-size-price value="${Number(size.price) || 0}"></label>
      <label class="size-field"><span>SOLD</span><input type="number" min="0" data-size-sold value="${Number(size.sold) || 0}"></label>
      <button type="button" class="row-danger" data-remove-size="${index}" title="Remove size">×</button>
    </div>`;
  }

  const readSizes = root => $$('[data-size-row]', root)
    .map(row => ({
      label: $('[data-size-label]', row).value.trim(),
      stock: Number($('[data-size-stock]', row).value) || 0,
      cost: Number($('[data-size-cost]', row).value) || 0,
      price: Number($('[data-size-price]', row).value) || 0,
      sold: Number($('[data-size-sold]', row).value) || 0
    }))
    .filter(size => size.label);

  function updateSizeTotals(root) {
    const sizes = readSizes(root);
    const stock = sizes.reduce((sum, size) => sum + size.stock, 0);
    const sold = sizes.reduce((sum, size) => sum + size.sold, 0);
    const soldOut = sizes.filter(size => size.stock <= 0).map(size => size.label);
    const target = $('[data-size-totals]', root);
    if (target) {
      target.innerHTML = `<b>${stock}</b> units in stock · <b>${sold}</b> sold${soldOut.length ? ` · <em class="danger-text">${soldOut.join(', ')} unavailable</em>` : ''}`;
    }
    $$('[data-size-row]', root).forEach(row => {
      row.classList.toggle('is-out', Number($('[data-size-stock]', row).value) <= 0);
    });
    const statusLine = $('[data-editor-stock-status]', root);
    if (statusLine) {
      const value = stock > 0 ? (stock <= 10 ? 'Low stock' : 'In stock') : 'Sold out';
      statusLine.textContent = `${value} · ${stock} units`;
      statusLine.className = 'status ' + (stock <= 10 ? 'low-stock' : 'in-stock');
    }
  }

  function buildProductModal() {
    if ($('#product-editor')) return $('#product-editor');
    const modal = document.createElement('div');
    modal.className = 'admin-modal product-editor';
    modal.id = 'product-editor';
    document.body.appendChild(modal);
    return modal;
  }

  function openProductEditor(index = -1) {
    const modal = buildProductModal();
    const product = index >= 0 ? Store.state.products[index] : null;
    const sizes = product ? product.sizes : [
      { label: 'S', stock: 10, cost: Math.round((product ? product.cost : 6000) * 0.45), price: product ? product.price : 6000, sold: 0 },
      { label: 'M', stock: 12, cost: Math.round((product ? product.cost : 6000) * 0.45), price: product ? product.price : 6000, sold: 0 },
      { label: 'L', stock: 8, cost: Math.round((product ? product.cost : 6000) * 0.45), price: product ? product.price : 6000, sold: 0 }
    ];

    modal.innerHTML = `
      <form class="product-editor-form" id="product-editor-form">
        <div class="editor-bar">
          <div class="editor-bar-titles">
            <p class="eyebrow">CATALOGUE</p>
            <h3>${product ? 'Edit product' : 'Add product'}</h3>
            <b class="status in-stock" data-editor-stock-status></b>
          </div>
          <div class="editor-bar-actions">
            <button type="button" class="button" data-close-editor>Cancel</button>
            <button type="submit" class="button button-dark">Save product</button>
          </div>
          <button type="button" class="modal-close" data-close-editor aria-label="Close">×</button>
        </div>

        <div class="editor-grid">
          <div class="editor-main">
            <label>Product name<input data-field="name" value="${escapeHtml(product ? product.name : '')}" required></label>
            <label>Description<textarea data-field="description" rows="3">${escapeHtml(product ? product.description : '')}</textarea></label>
            <label>Colours<input data-field="colors" value="${escapeHtml(product ? product.colors.join(', ') : 'Bone, Black')}"></label>

            <h4 class="editor-subhead">Sizes, stock &amp; pricing</h4>
            <p class="editor-hint">Set how many units you have per size, what each unit costs you, and the selling price for that exact size. Any size with 0 stock is automatically cut through on the website.</p>
            ${sizeRows(sizes)}

            <h4 class="editor-subhead">Base price &amp; badge</h4>
            <div class="form-columns">
              <label>Base price (Rs.)<input type="number" min="0" data-field="price" value="${product ? product.price : ''}" required></label>
              <label>Total cost (Rs.)<input type="number" min="0" data-field="cost" value="${product ? product.cost : ''}"></label>
              <label>Badge<input data-field="tag" value="${escapeHtml(product ? product.tag : '')}" placeholder="New, Bestseller, Core"></label>
            </div>
          </div>

          <aside class="editor-side">
            <label>Category<select data-field="category">
              ${Store.state.categories.filter(category => category !== 'New Arrivals')
                .map(category => `<option value="${slugify(category)}"${product && product.category === slugify(category) ? ' selected' : ''}>${escapeHtml(category)}</option>`).join('')}
            </select></label>
            <div data-main-image></div>
            <div data-gallery-images></div>
          </aside>
        </div>
      </form>`;

    // main image
    const mainSlot = $('[data-main-image]', modal);
    const mainPicker = imagePicker({
      label: 'Product image',
      value: product ? product.image : '',
      onChange: () => { }
    });
    mainSlot.appendChild(mainPicker.element);

    // gallery
    const gallerySlot = $('[data-gallery-images]', modal);
    const galleryWrap = document.createElement('div');
    galleryWrap.className = 'gallery-editor';
    galleryWrap.innerHTML = '<span class="picker-label">Gallery images</span><small class="file-help">Extra photos shown on the product page</small><div class="gallery-grid" data-gallery-grid></div><button type="button" class="button button-small ghost" data-add-gallery>Add image</button>';
    const galleryGrid = $('[data-gallery-grid]', galleryWrap);
    let gallery = product && product.gallery && product.gallery.length ? product.gallery.slice() : (product ? [product.image] : []);
    const paintGallery = () => {
      galleryGrid.innerHTML = gallery.map((source, index) =>
        `<div class="gallery-cell"><img src="${escapeHtml(source)}" alt=""><button type="button" data-remove-gallery="${index}">×</button></div>`).join('') || '<span class="file-help">No gallery images yet.</span>';
      $$('[data-remove-gallery]', galleryGrid).forEach(button => button.addEventListener('click', () => {
        gallery.splice(Number(button.dataset.removeGallery), 1);
        paintGallery();
      }));
    };
    paintGallery();
    $('[data-add-gallery]', galleryWrap).addEventListener('click', async () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = async () => {
        const file = input.files[0];
        if (file) { gallery.push(await readImage(file)); paintGallery(); }
      };
      input.click();
    });
    gallerySlot.appendChild(galleryWrap);

    // category -> size preset hints
    const sizeHost = $('[data-size-rows]', modal);
    const bindSizeEvents = () => {
      $('[data-add-size]', modal).onclick = () => {
        sizeHost.insertAdjacentHTML('beforeend', sizeRowHtml({ label: '', stock: 0, cost: Math.round(Number($('[data-field="cost"]', modal).value) * 0.45) || 0, price: Number($('[data-field="price"]', modal).value) || 0, sold: 0 }, $$('[data-size-row]', modal).length));
        updateSizeTotals(modal);
      };
      $('[data-size-preset]', modal).onchange = event => {
        const preset = SIZE_PRESETS[event.target.value];
        event.target.value = '';
        if (!preset) return;
        const basePrice = Number($('[data-field="price"]', modal).value) || 0;
        const baseCost = Math.round(basePrice * 0.45);
        const existing = readSizes(modal).map(size => size.label);
        preset.filter(label => !existing.includes(label)).forEach((label, offset) => {
          sizeHost.insertAdjacentHTML('beforeend', sizeRowHtml({ label, stock: 0, cost: baseCost, price: basePrice + offset * 200, sold: 0 }, $$('[data-size-row]', modal).length));
        });
        updateSizeTotals(modal);
      };
      modal.addEventListener('click', event => {
        const remove = event.target.closest('[data-remove-size]');
        if (!remove) return;
        remove.closest('[data-size-row]').remove();
        updateSizeTotals(modal);
      });
    };
    bindSizeEvents();
    modal.addEventListener('input', event => {
      if (event.target.closest('[data-size-row]')) updateSizeTotals(modal);
    });

    // "apply base price to all sizes" helper
    const priceField = $('[data-field="price"]', modal);
    priceField.addEventListener('change', () => {
      const value = Number(priceField.value) || 0;
      const apply = confirm('Apply this base price to every size?');
      if (!apply) return;
      $$('[data-size-price]', modal).forEach(input => { input.value = value; });
      $$('[data-size-cost]', modal).forEach(input => { input.value = Math.round(value * 0.45); });
      updateSizeTotals(modal);
    });

    updateSizeTotals(modal);
    $$('[data-close-editor]', modal).forEach(button => button.addEventListener('click', () => modal.classList.remove('show')));
    modal.addEventListener('click', event => { if (event.target === modal) modal.classList.remove('show'); });

    $('#product-editor-form', modal).addEventListener('submit', async event => {
      event.preventDefault();
      if (!Store.api.productsOnline) { toast('The shared product server is unavailable. Nothing was saved.'); return; }
      const sizes = readSizes(modal);
      if (!sizes.length) { toast('Add at least one size'); return; }
      const image = mainPicker.value;
      if (!image) { toast('Please upload a product image'); return; }
      const payload = {
        id: index,
        name: $('[data-field="name"]', modal).value.trim(),
        description: $('[data-field="description"]', modal).value.trim(),
        category: $('[data-field="category"]', modal).value,
        price: Number($('[data-field="price"]', modal).value) || 0,
        cost: Number($('[data-field="cost"]', modal).value) || 0,
        tag: $('[data-field="tag"]', modal).value.trim(),
        colors: $('[data-field="colors"]', modal).value.split(',').map(item => item.trim()).filter(Boolean),
        image,
        gallery: [image, ...gallery.filter(source => source !== image)],
        colorImages: index >= 0 ? Store.state.products[index].colorImages : {},
        colorMasks: index >= 0 ? Store.state.products[index].colorMasks : {},
        sizes
      };
      const submit = $('button[type="submit"]', modal);
      if (submit) submit.disabled = true;
      try {
        await cloudifyProductImages(payload, new Map());
      } catch (error) {
        toast(error.message || 'Could not upload product images.');
        if (submit) submit.disabled = false;
        return;
      }
      const saved = Store.upsertProduct(payload);
      if (saved < 0) {
        toast(Store.storageError() || 'Could not save the product');
        if (submit) submit.disabled = false;
        return;
      }
      try {
        await Store.api.saveProducts(Store.state.products, false);
        clearLocalProductCache();
        modal.classList.remove('show');
        toast(index >= 0 ? 'Product updated' : 'Product added');
        document.dispatchEvent(new CustomEvent('store:changed', { detail: { type: 'product' } }));
      } catch (error) {
        try { await Store.api.loadAdminProducts(); } catch (reloadError) { console.error('[products] restore after failed save:', reloadError); }
        toast(error.message || 'Could not save the product to Railway.');
      } finally {
        if (submit) submit.disabled = false;
      }
    });

    modal.classList.add('show');
    $('[data-field="name"]', modal).focus();
  }

  window.editProduct = openProductEditor;

  /* ------------------------------------------------------ orders table */

  const ORDER_STATUSES = ['Pending', 'Paid', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];

  /* What an admin types to find an order: the reference we emailed them, who it
   is from, or how to reach them. A customer only ever knows one of these. */
let orderSearchTerm = '';

function orderMatches(order, term) {
  const haystack = [
    order.id,
    order.trackingId,
    order.customer,
    order.email,
    order.phone,
    order.status,
    order.address,
    orderItemSummary(order)
  ].filter(Boolean).join(' ').toLowerCase();
  return haystack.indexOf(term) !== -1;
}

function filterOrders(term) {
  orderSearchTerm = term || '';
  renderOrders($('#orders-page-list'));
  const counter = $('#orders-page-count');
  if (!counter) return;
  const total = Store.state.orders.length;
  const shown = $('#orders-page-list')
    ? $('#orders-page-list').querySelectorAll('.page-order-row').length
    : total;
  counter.textContent = orderSearchTerm.trim()
    ? shown + ' of ' + total + ' orders'
    : total + ' orders';
}

/* "Bone / L" reads better than "(Bone / L)" repeated three times, and it keeps
     the search haystack and the admin sheet saying the same thing. */
  function orderItemSummary(order) {
    return (order.items || []).map(item => {
      const variant = [item.color || 'Colour not recorded', item.size || 'Size not recorded'].join(' / ');
      return `${escapeHtml(item.name)} (${escapeHtml(variant)}) × ${item.qty}`;
    }).join(', ') || '—';
  }

  function renderOrders(root) {
    if (!root) return;
    /* Re-applied on every render, so a search that survives a status change or
       a delete still shows only the matching rows. */
    const term = String(orderSearchTerm || '').trim().toLowerCase();
    const orders = Store.state.orders
      .map((order, index) => ({ order, index }))
      .filter(({ order }) => !term || orderMatches(order, term));

    root.innerHTML = orders.map(({ order, index }) => `
      <div class="page-order-row" data-order="${index}">
        <button class="page-order-main" data-open-order="${index}">
          <strong>${escapeHtml(order.id)}</strong>
          <span>${escapeHtml(order.customer)} · ${escapeHtml(order.date)}</span>
          <small>${orderItemSummary(order)}</small>
        </button>
        <span>${money(Store.orderTotal(order))}</span>
        <select data-order-status="${index}">
          ${ORDER_STATUSES.map(status => `<option${status === order.status ? ' selected' : ''}>${status}</option>`).join('')}
        </select>
        <button class="danger" data-remove-order="${index}">Delete</button>
      </div>`).join('')
      || `<p class="muted">${term ? 'No order matches "' + escapeHtml(orderSearchTerm.trim()) + '".' : 'No orders yet.'}</p>`;

    $$('[data-order-status]', root).forEach(select => select.addEventListener('change', event => {
      Store.setOrderStatus(Number(event.target.dataset.orderStatus), event.target.value);
      toast('Order marked ' + event.target.value);
      document.dispatchEvent(new CustomEvent('store:changed', { detail: { type: 'order' } }));
    }));
    $$('[data-remove-order]', root).forEach(button => button.addEventListener('click', () => {
      if (!confirm('Remove this order?')) return;
      Store.state.orders.splice(Number(button.dataset.removeOrder), 1);
      Store.save('orders');
      renderOrders(root);
      toast('Order removed');
    }));
    $$('[data-open-order]', root).forEach(button => button.addEventListener('click', () => openOrderSheet(Number(button.dataset.openOrder))));
  }

  let sheet = null;
  function ensureSheet() {
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.className = 'admin-modal order-sheet';
    sheet.id = 'order-sheet';
    document.body.appendChild(sheet);
    return sheet;
  }

  function openOrderSheet(index) {
    const order = Store.state.orders[index];
    if (!order) return;
    const host = ensureSheet();
    host.innerHTML = `
      <div class="product-editor-form">
        <button type="button" class="modal-close" data-close-sheet>×</button>
        <p class="eyebrow">ORDER DETAILS</p>
        <div class="editor-title-row">
          <h3>${escapeHtml(order.id)}</h3>
          <select data-sheet-status>
            ${ORDER_STATUSES.map(status => `<option${status === order.status ? ' selected' : ''}>${status}</option>`).join('')}
          </select>
        </div>
        <div class="order-detail-grid">
          <div><span>Customer</span><strong>${escapeHtml(order.customer)}</strong></div>
          <div><span>Phone</span><strong>${escapeHtml(order.phone || '—')}</strong></div>
          <div><span>Email</span><strong>${escapeHtml(order.email || '—')}</strong></div>
          <div><span>Delivery address</span><strong>${escapeHtml(order.address || '—')}</strong></div>
          <div><span>Payment</span><strong>${escapeHtml(order.payment || '—')}</strong></div>
          <div><span>Placed</span><strong>${escapeHtml(order.date)}</strong></div>
        </div>
        <h4 class="editor-subhead">Items</h4>
        <div class="order-sheet-items">
          ${(order.items || []).map(item => `
            <div class="order-sheet-line">
              <strong>${escapeHtml(item.name)}</strong>
              <span>${[item.color || 'Colour not recorded', item.size ? 'Size ' + escapeHtml(item.size) : 'Size not recorded'].map(escapeHtml).join(' · ')}</span>
              <span>${money(item.price)} × ${item.qty}</span>
              <b>${money(item.price * item.qty)}</b>
            </div>`).join('') || '<p class="muted">No items recorded.</p>'}
        </div>
        <div class="checkout-summary"><span>Order total</span><strong>${money(Store.orderTotal(order))}</strong></div>
      </div>`;
    $('[data-sheet-status]', host).addEventListener('change', event => {
      Store.setOrderStatus(index, event.target.value);
      toast('Order updated');
      renderOrders($('#orders-page-list'));
      document.dispatchEvent(new CustomEvent('store:changed', { detail: { type: 'order' } }));
    });
    $('[data-close-sheet]', host).addEventListener('click', () => host.classList.remove('show'));
    host.addEventListener('click', event => { if (event.target === host) host.classList.remove('show'); });
    host.classList.add('show');
  }

  function downloadInvoices() {
    const lines = Store.state.orders.map(order =>
      `${order.id} | ${order.customer} | ${order.phone || '-'} | ${orderItemSummary(order)} | ${money(Store.orderTotal(order))} | ${order.status} | ${order.payment || '-'}`);
    const blob = new Blob(['SOLIDS — ORDER INVOICES\n\n' + lines.join('\n')], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'solids-invoices.txt';
    link.click();
    URL.revokeObjectURL(link.href);
  }
  window.downloadInvoices = downloadInvoices;
  window.filterOrders = filterOrders;

  /* -------------------------------------------------------- customers */

  function renderCustomers(root) {
    if (!root) return;
    root.innerHTML = Store.state.users.map((user, index) => `
      <div class="customer-line page-customer-row">
        <div><strong>${escapeHtml(user.name)}</strong><small>${escapeHtml(user.email)}</small></div>
        <span>${user.orders}</span>
        <span>${money(user.spent)}</span>
        <b class="status ${user.status === 'Active' ? 'paid' : 'pending'}">${escapeHtml(user.status)}</b>
        <button data-user-status="${index}">${user.status === 'Active' ? 'Suspend' : 'Restore'}</button>
      </div>`).join('') || '<p class="muted">No customers yet.</p>';

    $$('[data-user-status]', root).forEach(button => button.addEventListener('click', () => {
      const user = Store.state.users[Number(button.dataset.userStatus)];
      Store.setUserStatus(Number(button.dataset.userStatus), user.status === 'Active' ? 'Suspended' : 'Active');
      renderCustomers(root);
      toast('Customer ' + (user.status === 'Active' ? 'suspended' : 'restored'));
    }));
  }

  /* -------------------------------------------- content / merchandising */

  const CONTENT_FIELDS = [
    { key: 'announcement', label: 'Announcement bar', kind: 'text' },
    { key: 'heroEyebrow', label: 'Hero eyebrow', kind: 'text' },
    { key: 'heroTitle', label: 'Hero heading', kind: 'text' },
    { key: 'heroSubline', label: 'Hero paragraph', kind: 'textarea' },
    { key: 'heroCta', label: 'Hero button text', kind: 'text' },
    { key: 'collectionsEyebrow', label: 'Collections eyebrow', kind: 'text' },
    { key: 'collectionsTitle', label: 'Collections heading', kind: 'text' },
    { key: 'collectionsNote', label: 'Collections note', kind: 'textarea' },
    { key: 'arrivalsEyebrow', label: 'New arrivals eyebrow', kind: 'text' },
    { key: 'arrivalsTitle', label: 'New arrivals heading', kind: 'text' },
    { key: 'manifestoEyebrow', label: 'Story eyebrow', kind: 'text' },
    { key: 'manifestoTitle', label: 'Story heading', kind: 'text' },
    { key: 'manifestoBody', label: 'Story paragraph', kind: 'textarea' },
    { key: 'footerTagline', label: 'Footer tagline', kind: 'text' }
  ];

  function renderContentEditor(root) {
    if (!root) return;
    const content = Store.state.content;
    root.innerHTML = `
      <div class="content-editor">
        <div class="content-fields">
          ${CONTENT_FIELDS.map(field => `
            <label>${field.label}
              ${field.kind === 'textarea'
                ? `<textarea rows="2" data-content="${field.key}">${escapeHtml(content[field.key] || '')}</textarea>`
                : `<input data-content="${field.key}" value="${escapeHtml(content[field.key] || '')}">`}
            </label>`).join('')}
        </div>
        <div class="content-images" data-content-images></div>
        <div class="modal-actions">
          <button type="button" class="button button-dark" data-save-content>Save website text &amp; images</button>
        </div>
      </div>`;

    const imagesHost = $('[data-content-images]', root);
    const heroPicker = imagePicker({
      label: 'Homepage hero image',
      value: content.heroImage,
      onChange: source => { content.heroImage = source; }
    });
    imagesHost.appendChild(heroPicker.element);

    $('[data-save-content]', root).addEventListener('click', () => {
      const patch = {};
      $$('[data-content]', root).forEach(input => { patch[input.dataset.content] = input.value.trim(); });
      patch.heroImage = heroPicker.value || Store.IMAGE.hero;
      Store.setContent(patch);
      toast('Website text and images updated');
    });
  }

  function renderCategories(root) {
    if (!root) return;
    root.innerHTML = Store.state.categories.map(category => {
      const count = Store.state.products.filter(product => product.category === slugify(category)).length;
      return `<div class="admin-category-row" data-category="${escapeHtml(category)}">
        <span>${escapeHtml(category)}</span>
        <small>${count} product${count === 1 ? '' : 's'}</small>
        <button data-rename-category="${escapeHtml(category)}">Rename</button>
        <button data-delete-category="${escapeHtml(category)}">Delete</button>
      </div>`;
    }).join('');

    $$('[data-rename-category]', root).forEach(button => button.addEventListener('click', () => {
      const current = button.dataset.renameCategory;
      const next = prompt('New category name', current);
      if (!next) return;
      if (!Store.renameCategory(current, next.trim())) { toast('Could not rename that category'); return; }
      renderCategories(root);
      document.dispatchEvent(new CustomEvent('store:changed', { detail: { type: 'category' } }));
      toast('Category renamed');
    }));
    $$('[data-delete-category]', root).forEach(button => button.addEventListener('click', () => {
      const name = button.dataset.deleteCategory;
      if (name === 'New Arrivals') { toast('The New Arrivals shelf cannot be deleted'); return; }
      if (!Store.removeCategory(name)) { toast('Move the products out of this category first'); return; }
      renderCategories(root);
      document.dispatchEvent(new CustomEvent('store:changed', { detail: { type: 'category' } }));
      toast('Category deleted');
    }));
  }

  function renderCollections(root) {
    if (!root) return;
    root.innerHTML = Store.state.collections.map((collection, index) => `
      <div class="admin-collection-row">
        <img src="${escapeHtml(collection.image || Store.IMAGE.fallback)}" alt="">
        <div>
          <input class="collection-name-input" data-collection-name="${index}" value="${escapeHtml(collection.name)}">
          <div class="collection-buttons">
            <button type="button" class="button button-small" data-collection-image="${index}">Change front image</button>
            <button type="button" class="button button-small ghost" data-remove-collection="${index}">Delete</button>
          </div>
        </div>
      </div>`).join('') || '<p class="muted">No collections yet.</p>';

    $$('[data-collection-name]', root).forEach(input => input.addEventListener('change', event => {
      const collection = Store.state.collections[Number(event.target.dataset.collectionName)];
      const next = event.target.value.trim();
      if (!collection || !next) { event.target.value = collection ? collection.name : ''; return; }
      Store.upsertCollection(Number(event.target.dataset.collectionName), { name: next, image: collection.image });
      toast('Collection renamed');
    }));
    $$('[data-collection-image]', root).forEach(button => button.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = async () => {
        const file = input.files[0];
        if (!file) return;
        const collection = Store.state.collections[Number(button.dataset.collectionImage)];
        Store.upsertCollection(Number(button.dataset.collectionImage), { name: collection.name, image: await readImage(file) });
        renderCollections(root);
        toast('Collection image updated');
      };
      input.click();
    }));
    $$('[data-remove-collection]', root).forEach(button => button.addEventListener('click', () => {
      Store.removeCollection(Number(button.dataset.removeCollection));
      renderCollections(root);
      toast('Collection removed');
    }));
  }

  function renderBanners(root) {
    if (!root) return;
    root.innerHTML = Store.state.banners.map((banner, index) => `
      <div class="banner-row">
        <img src="${escapeHtml(banner.image)}" alt="">
        <div><strong>${escapeHtml(banner.title)}</strong><small>${escapeHtml(banner.subtitle)}</small></div>
        <button class="mini-action" data-toggle-banner="${index}">${banner.active ? 'Live' : 'Hidden'}</button>
        <button class="mini-action" data-edit-banner="${index}">Edit</button>
        <button class="mini-action danger" data-remove-banner="${index}">Delete</button>
      </div>`).join('') || '<p class="muted">No banners yet.</p>';

    $$('[data-toggle-banner]', root).forEach(button => button.addEventListener('click', () => {
      Store.toggleBanner(Number(button.dataset.toggleBanner));
      renderBanners(root);
    }));
    $$('[data-remove-banner]', root).forEach(button => button.addEventListener('click', () => {
      Store.removeBanner(Number(button.dataset.removeBanner));
      renderBanners(root);
      toast('Banner removed');
    }));
    $$('[data-edit-banner]', root).forEach(button => button.addEventListener('click', () => {
      const banner = Store.state.banners[Number(button.dataset.editBanner)];
      const title = prompt('Banner title', banner.title);
      if (!title) return;
      const subtitle = prompt('Banner subtitle', banner.subtitle || '');
      const changeImage = confirm('Choose a new banner image?');
      if (changeImage) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async () => {
          const file = input.files[0];
          if (file) Store.upsertBanner(Number(button.dataset.editBanner), { title, subtitle, image: await readImage(file) });
          renderBanners(root);
          toast('Banner updated');
        };
        input.click();
        return;
      }
      Store.upsertBanner(Number(button.dataset.editBanner), { title, subtitle, image: banner.image });
      renderBanners(root);
      toast('Banner updated');
    }));
  }

  /* ------------------------------------------------------- page wiring */

  const PAGE = window.ADMIN_PAGE;

  function pageOverview() {
    const stats = Store.analytics();

    const setText = (selector, value) => {
      const element = $(selector);
      if (element) element.textContent = value;
    };
    setText('#stat-revenue', money(stats.revenue));
    setText('#stat-orders', stats.orderCount);
    setText('#stat-average', money(stats.averageOrder));
    setText('#stat-low-stock', stats.lowStockCount + stats.soldOutCount);
    setText('#stat-stock-value', money(stats.stockValue));
    setText('#stat-units', stats.unitsInStock);
    setText('#stat-sold', stats.unitsSold);
    setText('#stat-customers', stats.customerCount);
    setText('#stat-pending', stats.pendingCount);
    setText('#stat-products', stats.productCount);
    setText('#stat-profit', money(stats.potentialProfit));
    setText('#stat-unavailable', stats.outOfStockSizes.length);

    const lowList = $('#overview-low-stock');
    if (lowList) {
      const flagged = [];
      Store.state.products.forEach(product => {
        (product.sizes || []).forEach(size => {
          if (size.stock <= 10) flagged.push({ product, size });
        });
      });
      flagged.sort((a, b) => a.size.stock - b.size.stock);
      lowList.innerHTML = flagged.slice(0, 8).map(entry => `
        <div class="low-stock-line">
          <img src="${escapeHtml(entry.product.image)}" alt="">
          <div><strong>${escapeHtml(entry.product.name)}</strong><small>Size ${escapeHtml(entry.size.label)} · ${entry.size.stock} left · ${money(entry.size.price || entry.product.price)}</small></div>
          <b class="status ${entry.size.stock <= 0 ? 'low-stock' : 'pending'}">${entry.size.stock <= 0 ? 'Unavailable' : 'Low'}</b>
        </div>`).join('') || '<p class="muted">Every size is well stocked.</p>';
    }

    const recent = $('#overview-recent-orders');
    if (recent) {
      recent.innerHTML = Store.state.orders.slice(0, 5).map(order => `
        <button class="order-row" data-open-order="${Store.state.orders.indexOf(order)}">
          <div class="order-icon peach">${escapeHtml(order.initials)}</div>
          <div><strong>${escapeHtml(order.id)}</strong><small>${escapeHtml(order.customer)} · ${escapeHtml(order.date)}</small></div>
          <span>${money(Store.orderTotal(order))}</span>
          <b class="status ${order.status === 'Pending' ? 'pending' : 'paid'}">${escapeHtml(order.status)}</b>
        </button>`).join('');
      $$('[data-open-order]', recent).forEach(button => button.addEventListener('click', () => openOrderSheet(Number(button.dataset.openOrder))));
    }

    const topProducts = $('#overview-top-products');
    if (topProducts) {
      const list = Store.state.products.slice()
        .sort((a, b) => Store.totalSold(b) - Store.totalSold(a))
        .slice(0, 5);
      topProducts.innerHTML = list.map(product => `
        <div class="top-product-line">
          <img src="${escapeHtml(product.image)}" alt="">
          <div><strong>${escapeHtml(product.name)}</strong><small>${Store.totalSold(product)} sold · ${Store.totalStock(product)} in stock</small></div>
          <b>${money(Store.totalSold(product) * product.price)}</b>
        </div>`).join('');
    }
  }

  function pageProducts() {
    const list = $('#products-page-list');
    if (!list) return;
    const search = ($('#product-search')?.value || '').trim().toLowerCase();
    const filter = window.__productFilter || 'all';

    const rows = Store.state.products.filter(product => {
      if (search && !product.name.toLowerCase().includes(search)) return false;
      if (filter === 'out') return (product.sizes || []).some(size => size.stock <= 0);
      if (filter === 'low') { const stock = Store.totalStock(product); return stock > 0 && stock <= 10; }
      if (filter === 'sold') return Store.totalSold(product) > 0;
      if (filter !== 'all') return product.category === filter;
      return true;
    });

    list.innerHTML = rows.map(product => {
      const index = Store.state.products.indexOf(product);
      const stock = Store.totalStock(product);
      const status = Store.productStatus(product);
      const sold = Store.totalSold(product);
      const value = (product.sizes || []).reduce((sum, size) => sum + size.stock * (size.price || product.price), 0);
      const cost = (product.sizes || []).reduce((sum, size) => sum + size.stock * size.cost, 0);
      return `
      <div class="product-row" data-product-row="${index}">
        <div class="product-row-head">
          <div class="product-info">
            <img src="${escapeHtml(product.image)}" alt="">
            <span>
              <strong>${escapeHtml(product.name)}</strong>
              <small>${escapeHtml(Store.categoryName(product.category))} · ${product.sizes.length} sizes · ${escapeHtml(product.tag || 'No badge')}</small>
            </span>
          </div>
          <b class="status ${status.key}">${status.label}</b>
          <div class="row-actions">
            <button data-edit-product="${index}">Edit</button>
            <button class="danger" data-delete-product="${index}">Delete</button>
          </div>
        </div>
        <div class="size-chips">
          ${(product.sizes || []).map(size => `
            <button class="size-chip${size.stock <= 0 ? ' is-out' : ''}" data-edit-product="${index}" title="Click to edit">
              <b>${escapeHtml(size.label)}</b>
              <span>${size.stock} in stock</span>
              <em>${money(size.price || product.price)}</em>
              <small>cost ${money(size.cost)}</small>
            </button>`).join('')}
        </div>
        <div class="product-row-foot">
          <span>${stock} units in stock</span>
          <span>${sold} sold</span>
          <span>Stock value ${money(value)}</span>
          <span>Cost ${money(cost)}</span>
          <span class="${value - cost >= 0 ? 'good-text' : 'danger-text'}">${value - cost >= 0 ? 'Profit' : 'Loss'} ${money(Math.abs(value - cost))}</span>
        </div>
      </div>`;
    }).join('') || '<p class="muted">No products match this view.</p>';

    $$('[data-edit-product]', list).forEach(button => button.addEventListener('click', () => openProductEditor(Number(button.dataset.editProduct))));
    $$('[data-delete-product]', list).forEach(button => button.addEventListener('click', async () => {
      if (!Store.api.productsOnline) { toast('The shared product server is unavailable. Nothing was deleted.'); return; }
      const index = Number(button.dataset.deleteProduct);
      if (!confirm('Delete ' + Store.state.products[index].name + ' from the catalogue?')) return;
      if (!Store.removeProduct(index)) { toast(Store.storageError() || 'Could not delete product.'); return; }
      try {
        await Store.api.saveProducts(Store.state.products, false);
        clearLocalProductCache();
        renderProductsList();
        initShell();
        toast('Product deleted');
      } catch (error) {
        try { await Store.api.loadAdminProducts(); } catch (reloadError) { console.error('[products] restore after failed delete:', reloadError); }
        renderProductsList();
        toast(error.message || 'Could not delete product from Railway.');
      }
    }));

    const counter = $('#products-page-count');
    if (counter) counter.textContent = `${rows.length} of ${Store.state.products.length} products`;
  }

  function renderProductsList() { pageProducts(); }

  function pageOrders() {
    renderOrders($('#orders-page-list'));
    const counter = $('#orders-page-count');
    if (counter) counter.textContent = Store.state.orders.length + ' orders';
  }

  function pageCategories() {
    renderCategories($('#categories-page-list'));
    renderBanners($('#banners-page-list'));
    renderCollections($('#collections-page-list'));
    renderContentEditor($('#content-editor'));
    const counter = $('#categories-page-count');
    if (counter) counter.textContent = Store.state.categories.length + ' categories · ' + Store.state.collections.length + ' collections';
  }

  function pageCustomers() {
    renderCustomers($('#customers-page-list'));
    const counter = $('#customers-page-count');
    if (counter) counter.textContent = Store.state.users.length + ' registered customers';
  }

  const PAGES = {
    admin: pageOverview,
    'products.html': pageProducts,
    'orders.html': pageOrders,
    'categories.html': pageCategories,
    'customers.html': pageCustomers
  };

  /* ------------------------------------------------------------- boot */

  document.addEventListener('store:changed', () => {
    initShell();
    const page = PAGES[PAGE];
    if (page) page();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      $('#product-editor')?.classList.remove('show');
      $('#order-sheet')?.classList.remove('show');
    }
  });

  initShell();
  storageBanner();
  const boot = PAGES[PAGE];
  Store.api.productsReady
    .then(result => {
      if (!result.online) throw new Error('Cannot reach the Railway product API. Product changes are disabled.');
      return Store.api.loadAdminProducts();
    })
    .then(async result => {
      if (!result.configured) {
        const products = await cloudifyProducts(JSON.parse(JSON.stringify(Store.state.products)));
        Store.state.products = products;
        await Store.api.saveProducts(products, true);
      }
      clearLocalProductCache();
      initShell();
      if (boot) boot();
    })
    .catch(error => {
      initShell();
      if (boot) boot();
      toast(error.message || 'Could not load the shared product catalogue.');
    });

  // convenience: expose a re-render hook
  window.refreshAdmin = () => { initShell(); const page = PAGES[PAGE]; if (page) page(); };
  window.openProductEditor = openProductEditor;
})();
