/*
 * Solids admin workspace — shared behaviour for every dashboard page.
 * All writes go through Store (store-data.js) so the storefront updates instantly.
 */
(() => {
  'use strict';

  const Store = window.Store;
  if (!Store) return;

  const { money, slugify, escapeHtml, escapeAttr } = Store;

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

  /* Product editing is disabled on the server until ADMIN_KEY is set in Railway.
     That is not something the admin can fix from this page, so it gets a banner
     that stays up with the exact step instead of a prompt that goes nowhere. */
  function setupBanner() {
    let element = $('#setup-warning');
    if (!element) {
      element = document.createElement('div');
      element.id = 'setup-warning';
      element.className = 'storage-warning';
      document.body.appendChild(element);
    }
    const paint = message => {
      element.textContent = message || '';
      element.classList.toggle('show', Boolean(message));
    };

    Store.api.serverConfig().then(config => {
      paint(config.adminEditing
        ? ''
        : 'Admin login is not set up on Railway yet. Add ADMIN_USERNAME and ADMIN_PASSWORD to the service Variables, then redeploy.');
    });

    return paint;
  }
  window.setupBanner = setupBanner;

  /* A sign-out button in the sidebar. The session lives in an HttpOnly cookie
     the browser cannot clear itself, so it has to be the server that drops it. */
  function installLogout() {
    const sidebar = $('.admin-sidebar .sidebar-bottom');
    if (!sidebar || $('#admin-logout')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'admin-logout';
    button.className = 'admin-nav reset-store';
    button.innerHTML = '⏻ <span>Sign out</span>';
    button.addEventListener('click', () => {
      if (!confirm('Sign out of the studio workspace?')) return;
      fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' })
        .catch(() => { /* even if the call fails, leaving the page is right */ })
        .then(() => { window.location.href = 'admin-login.html'; });
    });
    sidebar.insertBefore(button, sidebar.querySelector('.admin-user'));
  }
  window.installLogout = installLogout;

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
      for (const key of Object.keys(images)) {
        // Each colour can hold one picture or a list of pictures.
        images[key] = Array.isArray(images[key])
          ? await Promise.all(images[key].map(upload))
          : await upload(images[key]);
      }
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
    /* Belt and braces: Store.write() no longer mirrors the catalogue while Railway
       is online, but an older tab may still have left a full base64 copy behind.
       Dropping it is what makes room for the rest of the admin's local settings. */
    try {
      localStorage.removeItem(Store.KEYS.products);
      Store.clearStorageError();
    } catch (error) {
      throw new Error('Products were saved to Railway, but this browser could not clear its old product-image cache.');
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

        <div class="editor-grid editor-sections">
          <section class="editor-section editor-basic">
            <h4 class="editor-section-title"><span>01</span> Basic details</h4>
            <div class="editor-fields">
            <label>Product name<input data-field="name" value="${escapeHtml(product ? product.name : '')}" required></label>
            <label>SKU<input data-field="sku" value="${escapeHtml(product ? product.sku || '' : '')}" placeholder="e.g. BURGUNDYKENDALL-0173"></label>
            <label>Category<select data-field="category">
              ${Store.state.categories.filter(category => category !== 'New Arrivals')
                .map(category => `<option value="${slugify(category)}"${product && product.category === slugify(category) ? ' selected' : ''}>${escapeHtml(category)}</option>`).join('')}
            </select></label>
            <label class="editor-description">Description<textarea data-field="description" rows="3">${escapeHtml(product ? product.description : '')}</textarea></label>
            <label>Base price (Rs.)<input type="number" min="0" data-field="price" value="${product ? product.price : ''}" required></label>
            <label>Total cost (Rs.)<input type="number" min="0" data-field="cost" value="${product ? product.cost : ''}"></label>
            <label>Badge<input data-field="tag" value="${escapeHtml(product ? product.tag : '')}" placeholder="New, Bestseller, Core"></label>
            </div>
          </section>

          <section class="editor-section editor-colours">
            <h4 class="editor-section-title"><span>02</span> Colours &amp; pictures</h4>
            <p class="editor-hint">Add each colour and its product photos. The first photo becomes the main image.</p>
            <div class="color-editor" data-color-editor>
              <div class="color-editor-rows" data-color-rows></div>
              <div class="color-editor-foot">
                <button type="button" class="button button-small" data-add-color>Add colour</button>
              </div>
            </div>
            <label class="split-image-toggle"><input type="checkbox" data-split-images${product && product.splitImageView ? ' checked' : ''}> Show product photos two at a time side by side</label>
          </section>

          <section class="editor-section editor-sizing">
            <h4 class="editor-section-title"><span>03</span> Sizing options &amp; combinations</h4>
            <div class="fit-group-manager" data-fit-group-manager>
              <div class="fit-group-manager-head"><strong>Customer fit options</strong></div>
              <p class="editor-hint">Every product uses the same set sizing: choose one set size and customise shirt and pant lengths.</p>
              <div data-fit-groups></div>
              <div class="fit-bulk-panel" data-fit-bulk-panel></div>
              <div class="fit-stock-matrix" data-fit-stock-matrix></div>
            </div>
          </section>

          <section class="editor-section editor-chart">
            <h4 class="editor-section-title"><span>04</span> Size chart &amp; measurements</h4>
            <p class="editor-hint">The storefront displays the built-in Shirt chart, Trouser / Pant chart, or both based on the product category.</p>
          </section>
        </div>
      </form>`;

    /* ------------------------------------------------- colour pictures
       Every colour the admin adds can carry its own picture(s). The storefront
       swaps to these exact photos when a shopper clicks the matching colour. */
    const colorRowsHost = $('[data-color-rows]', modal);
    let colorEntries = [];

    // Normalise whatever is already saved (string URL or array of URLs) into rows.
    const readSavedColors = () => {
      const saved = product && product.colorImages && typeof product.colorImages === 'object' ? product.colorImages : {};
      const known = product && Array.isArray(product.colors) ? product.colors : [];
      const names = known.concat(Object.keys(saved)).filter((name, position, list) => name && list.indexOf(name) === position);
      const savedVariants = product && product.colorVariants && typeof product.colorVariants === 'object' ? product.colorVariants : {};
      const hasColorPictures = Object.keys(saved).some(name => {
        const value = saved[name];
        return (Array.isArray(value) && value.some(Boolean)) || (typeof value === 'string' && value);
      });
      const legacyPictures = !hasColorPictures && product
        ? (Array.isArray(product.gallery) && product.gallery.length ? product.gallery : [product.image]).filter(Boolean)
        : [];
      return names.map((name, colorIndex) => {
        const value = saved[name];
        const colorPictures = Array.isArray(value) ? value.filter(Boolean) : (typeof value === 'string' && value ? [value] : []);
        const isLegacyFallback = colorIndex === 0 && !hasColorPictures && legacyPictures.length > 0;
        const images = colorPictures.length ? colorPictures : (isLegacyFallback ? legacyPictures : []);
        const source = Array.isArray(savedVariants[name]) ? savedVariants[name] : sizes;
        const divisor = Math.max(1, names.length);
        const variantSizes = source.map(size => {
          const stock = Number(size.stock) || 0;
          const sold = Number(size.sold) || 0;
          return Object.assign({}, size, {
            stock: Array.isArray(savedVariants[name]) ? stock : Math.floor(stock / divisor) + (colorIndex < stock % divisor ? 1 : 0),
            sold: Array.isArray(savedVariants[name]) ? sold : Math.floor(sold / divisor) + (colorIndex < sold % divisor ? 1 : 0)
          });
        });
        return { name, committedName: name, images, sizes: variantSizes, isLegacyFallback };
      });
    };
    colorEntries = readSavedColors();
    const FIT_OPTION_DEFAULTS = [
      { id: 'set_size', label: 'Set Size', display: 'radio', values: ['XS', 'S', 'M', 'L', 'XL'] },
      { id: 'shirt_length', label: 'Shirt Length', display: 'radio', values: ['44', '46', '48', '50'] },
      { id: 'pant_length', label: 'Pant Length', display: 'radio', values: ['32', '34', '36', '38'] }
    ];
    let fitGroups = FIT_OPTION_DEFAULTS.map((group, index) => {
      const saved = product && Array.isArray(product.fitOptionGroups)
        ? product.fitOptionGroups.find(candidate => candidate.id === group.id || String(candidate.label || '').toLowerCase() === group.label.toLowerCase()) || product.fitOptionGroups[index]
        : null;
      const values = saved && Array.isArray(saved.values || saved.options) && (saved.values || saved.options).length
        ? (saved.values || saved.options).map(String)
        : group.values.slice();
      return { ...group, display: 'radio', values };
    });
    const copyFitGroup = group => ({ ...group, values: (group.values || []).slice() });
    let fitVariants = product && Array.isArray(product.fitVariants) ? product.fitVariants.map(variant => ({ ...variant, values: (variant.values || []).slice() })) : [];
    let fitMatrixCombinations = [];
    const fitMatrixHost = $('[data-fit-stock-matrix]', modal);
    const fitBulkHost = $('[data-fit-bulk-panel]', modal);
    const fitVariantKey = (color, values) => Store.fitVariantKey(color, values);
    const getFitGroupIndex = kind => fitGroups.findIndex(group => {
      const label = String(group.label || '').toLowerCase();
      if (kind === 'set-size') return /set\s*size/.test(label);
      if (kind === 'shirt-size') return /shirt/.test(label) && /size/.test(label);
      if (kind === 'pant-size') return /(pant|trouser)/.test(label) && /size/.test(label);
      const length = /length/.test(label);
      return length && (kind === 'shirt-length' ? /shirt/.test(label) : /(pant|trouser)/.test(label));
    });
    const syncFitMatrix = () => {
      const current = new Map(fitVariants.map(variant => [variant.key || fitVariantKey(variant.color, variant.values), variant]));
      $$('[data-fit-matrix-row]', fitMatrixHost).forEach(row => {
        const key = row.dataset.fitKey;
        const previous = current.get(key) || { key, color: row.dataset.fitColor, values: JSON.parse(row.dataset.fitValues || '[]'), sold: 0 };
        current.set(key, { ...previous, stock: Math.max(0, Number($('[data-combo-stock]', row).value) || 0) });
      });
      fitVariants = Array.from(current.values());
    };
    const paintFitMatrix = () => {
      if (!fitMatrixHost) return;
      syncFitMatrix();
      const groups = fitGroups;
      if (!groups.length || groups.some(group => !group.label || !group.values.length)) {
        fitBulkHost.innerHTML = ''; fitMatrixHost.innerHTML = '<p class="file-help">Add a label and at least one option to each group to create the combination table.</p>'; return;
      }
      const colors = colorEntries.map(entry => entry.name.trim()).filter(Boolean);
      if (!colors.length) { fitBulkHost.innerHTML = ''; fitMatrixHost.innerHTML = '<p class="file-help">Add a colour before setting combination stock.</p>'; return; }
      const combos = [];
      const add = (color, index, values) => {
        if (index === groups.length) { combos.push({ color, values: values.slice(), key: fitVariantKey(color, values) }); return; }
        groups[index].values.forEach(value => add(color, index + 1, values.concat(value)));
      };
      colors.forEach(color => add(color, 0, []));
      if (combos.length > 2000) { fitBulkHost.innerHTML = ''; fitMatrixHost.innerHTML = `<p class="danger-text">${combos.length} combinations is too many to manage here. Reduce the choices to 2,000 or fewer.</p>`; return; }
      const previousVariants = fitVariants.slice();
      const existing = new Map(previousVariants.map(variant => [variant.key || fitVariantKey(variant.color, variant.values), variant]));
      const validKeys = new Set(combos.map(combo => combo.key));
      const orphaned = new Map();
      previousVariants.filter(variant => !validKeys.has(variant.key || fitVariantKey(variant.color, variant.values))).forEach(variant => {
        const total = orphaned.get(variant.color) || { stock: 0, sold: 0 };
        total.stock += Number(variant.stock) || 0; total.sold += Number(variant.sold) || 0; orphaned.set(variant.color, total);
      });
      const firstForColor = new Set();
      fitMatrixCombinations = combos.map(combo => {
        const saved = existing.get(combo.key);
        const next = saved ? { ...saved, ...combo } : { ...combo, stock: 0, sold: 0 };
        if (!firstForColor.has(combo.color)) {
          firstForColor.add(combo.color);
          const extra = orphaned.get(combo.color);
          if (extra) { next.stock += extra.stock; next.sold += extra.sold; }
        }
        return next;
      });
      fitVariants = fitMatrixCombinations.map(variant => ({ ...variant, values: variant.values.slice() }));
      const headers = groups.map(group => /^set\s*size$/i.test(group.label) ? 'SIZE' : group.label).concat(['In stock', 'Sold']);
      const shirtLengthIndex = getFitGroupIndex('shirt-length');
      const pantLengthIndex = getFitGroupIndex('pant-length');
      const setSizeIndex = getFitGroupIndex('set-size');
      const lengthOptions = (index, allLabel, selectLabel) => {
        if (index < 0) return `<label>${selectLabel}<select disabled><option value="">Not configured</option></select></label>`;
        const group = groups[index];
        return `<label>${escapeHtml(group.label)}<select data-bulk-length="${index}"><option value="">${escapeHtml(allLabel)}</option>${group.values.map(value => `<option value="${escapeAttr(value)}">${escapeHtml(value)}</option>`).join('')}</select></label>`;
      };
      const sizeOptions = (index, allLabel, selectLabel) => {
        if (index < 0) return `<label>${selectLabel}<select disabled><option value="">Not configured</option></select></label>`;
        const group = groups[index];
        return `<label>${escapeHtml(group.label)}<select data-bulk-size="${index}"><option value="">${escapeHtml(allLabel)}</option>${group.values.map(value => `<option value="${escapeAttr(value)}">${escapeHtml(value)}</option>`).join('')}</select></label>`;
      };
      fitBulkHost.innerHTML = `<div class="fit-bulk-heading"><strong>Quick bulk stock</strong><span>Set stock across matching combinations</span></div>
        <div class="fit-bulk-control" data-fit-bulk>
          <label>Select Colour<select data-bulk-color><option value="">All Colours</option>${colors.map(color => `<option value="${escapeAttr(color)}">${escapeHtml(color)}</option>`).join('')}</select></label>
          ${sizeOptions(setSizeIndex, 'All Set Sizes', 'Set Size')}
          ${lengthOptions(shirtLengthIndex, 'All Shirt Lengths', 'Shirt Length')}
          ${lengthOptions(pantLengthIndex, 'All Pant Lengths', 'Pant Length')}
          <label>Stock amount<input type="number" min="0" step="1" data-bulk-stock placeholder="e.g. 50"></label>
          <button type="button" class="button button-small" data-bulk-action>Apply stock to matching combinations</button>
        </div>`;
      const byColor = colors.map((color, colorIndex) => `<details class="fit-color-group"${colorIndex === 0 ? ' open' : ''}><summary>${escapeHtml(color)} <span>${fitMatrixCombinations.filter(row => row.color === color).length} combinations</span></summary>
        <div class="fit-matrix-scroll"><table class="fit-combination-table"><thead><tr>${headers.map(head => `<th>${escapeHtml(head)}</th>`).join('')}</tr></thead><tbody>
        ${fitMatrixCombinations.filter(row => row.color === color).map(row => `<tr data-fit-matrix-row data-fit-key="${escapeAttr(row.key)}" data-fit-color="${escapeAttr(row.color)}" data-fit-values="${escapeAttr(JSON.stringify(row.values))}">
          ${row.values.map(value => `<td>${escapeHtml(value)}</td>`).join('')}
          <td><input aria-label="${escapeAttr(row.color + ' stock')}" type="number" min="0" data-combo-stock value="${Number(row.stock) || 0}"></td>
          <td><input aria-label="${escapeAttr(row.color + ' sold')}" type="number" value="${Number(row.sold) || 0}" readonly></td></tr>`).join('')}
        </tbody></table></div></details>`).join('');
      fitMatrixHost.innerHTML = `<div class="fit-matrix-heading"><strong>Stock per combination</strong><span>${combos.length} total</span></div><label class="fit-matrix-search">Search variants<input type="search" data-fit-matrix-search placeholder="Search variants (e.g., M, 48, 32)..." autocomplete="off"></label>${byColor}`;
      const applyFitMatrixSearch = query => {
        const terms = String(query || '').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
        $$('[data-fit-matrix-row]', fitMatrixHost).forEach(row => {
          const searchable = [row.dataset.fitColor, ...JSON.parse(row.dataset.fitValues || '[]')].join(' ').toLocaleLowerCase();
          row.hidden = terms.length > 0 && !terms.every(term => searchable.includes(term));
        });
        $$('[data-fit-matrix-row]', fitMatrixHost).forEach(row => {
          const group = row.closest('.fit-color-group');
          if (group) group.hidden = !group.querySelector('[data-fit-matrix-row]:not([hidden])');
        });
      };
      $('[data-fit-matrix-search]', fitMatrixHost).addEventListener('input', event => applyFitMatrixSearch(event.target.value));
      const total = fitMatrixCombinations.reduce((sum, row) => sum + (Number(row.stock) || 0), 0);
      const status = $('[data-editor-stock-status]', modal);
      if (status) { status.textContent = `${total ? (total <= 10 ? 'Low stock' : 'In stock') : 'Sold out'} · ${total} units`; status.className = 'status ' + (total <= 10 ? 'low-stock' : 'in-stock'); }
    };
    fitMatrixHost.addEventListener('input', event => { if (event.target.matches('[data-combo-stock]')) { syncFitMatrix(); const total = fitVariants.reduce((sum, variant) => sum + (Number(variant.stock) || 0), 0); const status = $('[data-editor-stock-status]', modal); if (status) status.textContent = `${total ? (total <= 10 ? 'Low stock' : 'In stock') : 'Sold out'} · ${total} units`; } });
    fitBulkHost.addEventListener('click', event => {
      const button = event.target.closest('[data-bulk-action]');
      if (!button) return;
      const control = button.closest('[data-fit-bulk]');
      const shirtLengthIndex = getFitGroupIndex('shirt-length');
      const pantLengthIndex = getFitGroupIndex('pant-length');
      const setSizeIndex = getFitGroupIndex('set-size');
      const selectedShirtLength = $('[data-bulk-length="' + shirtLengthIndex + '"]', control)?.value || '';
      const selectedPantLength = $('[data-bulk-length="' + pantLengthIndex + '"]', control)?.value || '';
      const selectedSetSize = $('[data-bulk-size="' + setSizeIndex + '"]', control)?.value || '';
      const selectedColor = $('[data-bulk-color]', fitBulkHost)?.value || '';
      const amountField = $('[data-bulk-stock]', control);
      const amount = Number(amountField.value);
      if (!amountField.value.trim() || !Number.isFinite(amount) || amount < 0) { amountField.focus(); toast('Enter a valid stock amount first.'); return; }
      syncFitMatrix();
      let updated = 0;
      $$('[data-fit-matrix-row]', fitMatrixHost).forEach(row => {
        const values = JSON.parse(row.dataset.fitValues || '[]');
        if (selectedColor && row.dataset.fitColor !== selectedColor) return;
        if (selectedSetSize && String(values[setSizeIndex] || '') !== selectedSetSize) return;
        if (selectedShirtLength && String(values[shirtLengthIndex] || '') !== selectedShirtLength) return;
        if (selectedPantLength && String(values[pantLengthIndex] || '') !== selectedPantLength) return;
        $('[data-combo-stock]', row).value = String(Math.floor(amount));
        updated += 1;
      });
      syncFitMatrix();
      const total = fitVariants.reduce((sum, variant) => sum + (Number(variant.stock) || 0), 0);
      const status = $('[data-editor-stock-status]', modal);
      if (status) { status.textContent = `${total ? (total <= 10 ? 'Low stock' : 'In stock') : 'Sold out'} · ${total} units`; status.className = 'status ' + (total <= 10 ? 'low-stock' : 'in-stock'); }
      toast(`Updated ${updated} combinations. Save product to keep the changes.`);
    });
    const fitGroupsHost = $('[data-fit-groups]', modal);
    const parseFitValues = value => Array.from(new Set(String(value || '').split(',').map(item => item.trim()).filter(Boolean)));
    const paintFitGroups = () => {
      fitGroupsHost.innerHTML = fitGroups.map((group, index) => `<div class="fit-group-editor fit-group-locked" data-fit-group-row="${index}">
        <strong>${escapeHtml(group.label)}</strong><span>Radio buttons</span>
        <label>Values<input type="text" data-fit-group-options value="${escapeAttr(group.values.join(', '))}" placeholder="Comma-separated values"></label>
      </div>`).join('');
    };
    paintFitGroups();
    fitGroupsHost.addEventListener('change', event => {
      const input = event.target.closest('[data-fit-group-options]');
      if (!input) return;
      const row = input.closest('[data-fit-group-row]');
      const index = Number(row && row.dataset.fitGroupRow);
      if (!fitGroups[index]) return;
      fitGroups[index].values = parseFitValues(input.value);
      paintFitMatrix();
    });
    const skuInput = $('[data-field="sku"]', modal);
    const updateFitStatus = () => {
      const status = $('[data-editor-stock-status]', modal);
      if (!status) return;
      const total = fitVariants.reduce((sum, variant) => sum + (Number(variant.stock) || 0), 0);
      status.textContent = `${total > 0 ? (total <= 10 ? 'Low stock' : 'In stock') : 'Sold out'} · ${total} sets`;
      status.className = 'status ' + (total <= 10 ? 'low-stock' : 'in-stock');
    };
    const paintColors = () => {
      colorRowsHost.innerHTML = colorEntries.map((entry, rowIndex) => `
        <div class="color-editor-row" data-color-row="${rowIndex}">
          <div class="color-editor-head">
            <input class="color-name-input" data-color-name value="${escapeHtml(entry.name)}" placeholder="Colour name e.g. Snow">
            <button type="button" class="button button-small" data-add-color-image>+ Add pictures</button>
            <button type="button" class="button button-small ghost" data-remove-color>Remove colour</button>
          </div>
          <div class="color-editor-images color-thumbs" data-color-images>
            ${entry.images.map((source, imageIndex) => `
              <div class="color-thumb">
                <img src="${escapeHtml(source)}" alt="">
                <button type="button" data-remove-color-image="${imageIndex}" title="Remove picture">×</button>
              </div>`).join('')}
            <button type="button" class="color-thumb-add" data-add-color-image title="Add more pictures">
              <span aria-hidden="true">+</span>Add pictures
            </button>
          </div>
          <small class="file-help">${entry.isLegacyFallback ? entry.images.length + ' existing product picture' + (entry.images.length > 1 ? 's shown' : ' shown') + ' under the first colour. Saving will associate them with this colour.' : entry.images.length ? entry.images.length + ' picture' + (entry.images.length > 1 ? 's' : '') + ' added. The first one is this colour\'s main photo.' : 'No picture for this colour yet — click “Add pictures”.'}</small>
        </div>`).join('') || '<span class="file-help">No colours added yet.</span>';
      updateFitStatus();
      paintFitMatrix();
    };
    paintColors();

    modal.classList.add('fit-options-active');

    $('[data-add-color]', modal).addEventListener('click', () => {
      const initialSizes = sizes.map(size => Object.assign({}, size, {
        stock: colorEntries.length ? 0 : Number(size.stock) || 0,
        sold: 0
      }));
      colorEntries.push({ name: '', committedName: '', images: [], sizes: initialSizes });
      paintColors();
      const inputs = $$('[data-color-name]', colorRowsHost);
      if (inputs.length) inputs[inputs.length - 1].focus();
    });

    colorRowsHost.addEventListener('input', event => {
      if (!event.target.matches('[data-color-name]')) return;
      const row = event.target.closest('[data-color-row]');
      if (!row) return;
      const entry = colorEntries[Number(row.dataset.colorRow)];
      entry.name = event.target.value;
      const title = $('[data-variant-title]', row);
      if (title) title.textContent = 'Sizes & stock · ' + (entry.name || 'Colour ' + (Number(row.dataset.colorRow) + 1));
    });
    colorRowsHost.addEventListener('change', event => {
      if (!event.target.matches('[data-color-name]')) return;
      const row = event.target.closest('[data-color-row]');
      const entry = row && colorEntries[Number(row.dataset.colorRow)];
      if (entry) {
        syncFitMatrix();
        const previous = entry.committedName;
        const next = entry.name.trim();
        if (previous !== next) fitVariants = fitVariants.map(variant => variant.color === previous
          ? { ...variant, color: next, key: fitVariantKey(next, variant.values) } : variant);
        entry.committedName = next;
        fitMatrixHost.innerHTML = '';
        paintFitMatrix();
      }
    });

    colorRowsHost.addEventListener('click', event => {
      const row = event.target.closest('[data-color-row]');
      if (!row) return;
      const rowIndex = Number(row.dataset.colorRow);
      const entry = colorEntries[rowIndex];
      if (!entry) return;

      if (event.target.closest('[data-remove-color]')) {
        colorEntries.splice(rowIndex, 1);
        paintColors();
        return;
      }
      if (event.target.closest('[data-remove-color-image]')) {
        entry.images.splice(Number(event.target.closest('[data-remove-color-image]').dataset.removeColorImage), 1);
        paintColors();
        return;
      }
      if (event.target.closest('[data-add-color-image]')) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.multiple = true;
        input.onchange = async () => {
          for (const file of Array.from(input.files)) {
            if (file && file.type.startsWith('image/')) entry.images.push(await readImage(file));
          }
          paintColors();
        };
        input.click();
      }
    });

    updateFitStatus();
    $$('[data-close-editor]', modal).forEach(button => button.addEventListener('click', () => modal.classList.remove('show')));
    modal.addEventListener('click', event => { if (event.target === modal) modal.classList.remove('show'); });

    $('#product-editor-form', modal).addEventListener('submit', async event => {
      event.preventDefault();
      if (!Store.api.productsOnline) { toast('The shared product server is unavailable. Nothing was saved.'); return; }
      fitGroups = fitGroups.map((group, index) => {
        const row = $$('[data-fit-group-row]', fitGroupsHost)[index];
        const input = row && $('[data-fit-group-options]', row);
        return { ...group, display: 'radio', values: parseFitValues(input ? input.value : group.values.join(', ')) };
      });
      const name = $('[data-field="name"]', modal).value.trim();
      if (!name) { toast('Please enter a product name'); return; }
      const fitOptionsEnabled = true;
      if (fitOptionsEnabled) {
        if (fitGroups.some(group => !group.label || !group.values.length) || new Set(fitGroups.map(group => group.label.toLowerCase())).size !== fitGroups.length) {
          toast('Each fit group needs a unique label and at least one option.'); return;
        }
        const hasDuplicateOptions = fitGroups.some(group => new Set(group.values.map(value => value.toLowerCase())).size !== group.values.length);
        if (hasDuplicateOptions) {
          toast('Options within each fit group must be unique.');
          return;
        }
        const expectedCombinations = colorEntries.filter(entry => entry.name.trim()).length * fitGroups.reduce((count, group) => count * group.values.length, 1);
        if (expectedCombinations > 2000) { toast('Reduce the choices to 2,000 or fewer colour/option combinations.'); return; }
        paintFitMatrix();
        syncFitMatrix();
        if (!fitVariants.length || fitVariants.length !== expectedCombinations || fitVariants.some(variant => variant.values.length !== fitGroups.length)) {
          toast('Add at least one complete option combination before saving.'); return;
        }
      }
      if (fitOptionsEnabled) {
        if (fitGroups.some(group => !group.values.length)) {
          toast('Add at least one option to every fit group.');
          return;
        }
      }

      // Collect the colour rows, dropping blanks and merging duplicates.
      const colorImages = {};
      const colorVariants = {};
      const colorOrder = [];
      colorEntries.forEach(entry => {
        const colorName = String(entry.name || '').trim();
        if (!colorName) return;
        if (!(colorName in colorImages)) colorOrder.push(colorName);
        const kept = (entry.images || []).filter(Boolean);
        const previous = Array.isArray(colorImages[colorName]) ? colorImages[colorName] : [];
        colorImages[colorName] = kept.length ? kept : previous;
        if (!(colorName in colorVariants)) colorVariants[colorName] = entry.sizes;
      });
      if (!colorOrder.length) { toast('Please add at least one colour with a picture'); return; }
      if (new Set(colorOrder.map(color => color.toLowerCase())).size !== colorOrder.length) {
        toast('Each product colour must have a unique name.');
        return;
      }
      const colors = colorOrder;

      /* Product photos are derived from the colour pictures: the very first
         picture of the first colour is the main image, and every colour picture
         fills the product gallery. */
      const allPictures = [];
      colorOrder.forEach(colorName => {
        (colorImages[colorName] || []).forEach(source => {
          if (source && allPictures.indexOf(source) === -1) allPictures.push(source);
        });
      });
      const image = allPictures[0] || (product ? product.image : '');
      if (!image) { toast('Please upload at least one colour picture'); return; }

      const sizeLabels = Array.from(new Set(Object.keys(colorVariants).reduce((labels, colorName) => labels.concat(colorVariants[colorName].map(size => size.label)), [])));
      const legacySizes = sizeLabels.map(label => {
        const variants = colorOrder.map(colorName => colorVariants[colorName].find(size => size.label === label)).filter(Boolean);
        return {
          label,
          stock: variants.reduce((sum, size) => sum + size.stock, 0),
          cost: variants[0] ? variants[0].cost : 0,
          price: variants[0] ? variants[0].price : Number($('[data-field="price"]', modal).value) || 0,
          compareAtPrice: variants[0] ? variants[0].compareAtPrice : 0,
          sold: variants.reduce((sum, size) => sum + size.sold, 0)
        };
      });

      const payload = {
        id: index,
        name,
        description: $('[data-field="description"]', modal).value.trim(),
        sku: skuInput.value.trim(),
        category: $('[data-field="category"]', modal).value,
        productType: 'set',
        product_type: 'set',
        separateItem: '',
        price: Number($('[data-field="price"]', modal).value) || 0,
        cost: Number($('[data-field="cost"]', modal).value) || 0,
        tag: $('[data-field="tag"]', modal).value.trim(),
        colors,
        colorVariants,
        image,
        gallery: allPictures,
        splitImageView: $('[data-split-images]', modal).checked,
        colorImages,
        colorMasks: index >= 0 ? Store.state.products[index].colorMasks : {},
        sizes: legacySizes,
        fitOptionsEnabled,
        fitOptionGroups: fitGroups.map(group => ({ id: group.id, label: group.label, type: group.display, display: group.display, options: group.values, values: group.values })),
        fitVariants: fitOptionsEnabled ? fitVariants : [],
        fitInventory: {}
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
        /* The catalogue reached Railway, so nothing was actually lost — the banner
           from a stale localStorage failure must not stay on screen. */
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
      const variant = [item.color || 'Colour not recorded', item.options ? Object.entries(item.options).map(([label, value]) => `${label}: ${value}`).join(' · ') : item.size || 'Size not recorded'].join(' / ');
      return `${escapeHtml(item.name)}${item.sku ? ' [SKU ' + escapeHtml(item.sku) + ']' : ''} (${escapeHtml(variant)}) × ${item.qty}`;
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
      const status = event.target.value;
      Promise.resolve(Store.setOrderStatus(Number(event.target.dataset.orderStatus), status)).then(result => {
        toast(result && result.ok === false ? 'Order saved locally; server notification failed.' : 'Order marked ' + status);
        document.dispatchEvent(new CustomEvent('store:changed', { detail: { type: 'order' } }));
      });
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
              <strong>${escapeHtml(item.name)}${item.sku ? ' · SKU ' + escapeHtml(item.sku) : ''}</strong>
              <span>${[item.color || 'Colour not recorded', item.options ? Object.entries(item.options).map(([label, value]) => `${label}: ${value}`).join(' · ') : item.size ? 'Size ' + item.size : 'Size not recorded'].map(escapeHtml).join(' · ')}</span>
              <span>${money(item.price)} × ${item.qty}</span>
              <b>${money(item.price * item.qty)}</b>
            </div>`).join('') || '<p class="muted">No items recorded.</p>'}
        </div>
        <div class="checkout-summary"><span>Order total</span><strong>${money(Store.orderTotal(order))}</strong></div>
      </div>`;
    $('[data-sheet-status]', host).addEventListener('change', event => {
      const status = event.target.value;
      Promise.resolve(Store.setOrderStatus(index, status)).then(result => {
        toast(result && result.ok === false ? 'Order saved locally; server notification failed.' : 'Order updated');
        renderOrders($('#orders-page-list'));
        document.dispatchEvent(new CustomEvent('store:changed', { detail: { type: 'order' } }));
      });
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
    root.innerHTML = '<p class="muted">Loading customer activity…</p>';
    fetch('/api/admin/customers', { credentials: 'same-origin' })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load customer activity.');
        return data;
      })
      .then(report => {
        const metrics = report.metrics || {};
        const metricsHost = $('#customer-activity-metrics');
        const count = $('#customers-page-count');
        if (metricsHost) {
          metricsHost.innerHTML = [
            [metrics.registered, 'registered accounts'],
            [metrics.guests, 'checkout guests'],
            [metrics.signedIn, 'users signed in'],
            [metrics.signIns, 'total sign-ins'],
            [metrics.wishlistEntries, 'wishlist saves']
          ].map(([value, label]) => `<div><strong>${Number(value) || 0}</strong><span>${label}</span></div>`).join('');
        }
        if (count) count.textContent = `${report.customers.length} people · ${metrics.registered || 0} accounts · ${metrics.guests || 0} guests`;
        root.innerHTML = (report.customers || []).map(customer => {
          const saved = (customer.wishlist || []).map(product =>
            `<a href="product.html?product=${Number(product.productIndex)}" target="_blank" rel="noopener">${escapeHtml(product.name)}</a>`).join('');
          const lastSignIn = customer.lastSignInAt
            ? new Date(customer.lastSignInAt).toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' })
            : 'Never';
          return `<div class="account-customer-row">
            <div><strong>${escapeHtml(customer.name)}</strong><small>${escapeHtml(customer.email)}</small></div>
            <b class="status ${customer.registered ? 'paid' : 'pending'}">${customer.registered ? 'Registered' : 'Guest'}</b>
            <span>${Number(customer.orders) || 0}</span>
            <span>${money(customer.spent)}</span>
            <span>${Number(customer.signInCount) || 0}</span>
            <span>${escapeHtml(lastSignIn)}</span>
            <div class="admin-wishlist-list">${saved || '<span class="muted">No saved products</span>'}</div>
          </div>`;
        }).join('') || '<p class="muted">No customers yet.</p>';
      })
      .catch(error => {
        root.innerHTML = `<p class="muted">${escapeHtml(error.message || 'Could not load customer activity.')}</p>`;
      });

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
        Store.inventoryRows(product).forEach(size => {
          if (size.stock <= 10) flagged.push({ product, size });
        });
      });
      flagged.sort((a, b) => a.size.stock - b.size.stock);
      lowList.innerHTML = flagged.slice(0, 8).map(entry => `
        <div class="low-stock-line">
          <img src="${escapeHtml(entry.product.image)}" alt="">
          <div><strong>${escapeHtml(entry.product.name)}</strong><small>${entry.size.color ? escapeHtml(entry.size.color) + ' · ' : ''}Size ${escapeHtml(entry.size.label)} · ${entry.size.stock} left · ${money(entry.size.price || entry.product.price)}</small></div>
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
    if (!list.dataset.productActionsBound) {
      list.dataset.productActionsBound = 'true';
      list.addEventListener('click', async event => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const deleteButton = target.closest('[data-delete-product]');
        if (!deleteButton || !list.contains(deleteButton)) return;
        if (!Store.api.productsOnline) { toast('The shared product server is unavailable. Nothing was deleted.'); return; }
        const index = Number(deleteButton.dataset.deleteProduct);
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
      });
    }
    const search = ($('#product-search')?.value || '').trim().toLowerCase();
    const filter = window.__productFilter || 'all';

    const rows = Store.state.products.filter(product => {
      if (search && !product.name.toLowerCase().includes(search)) return false;
      if (filter === 'out') return Store.inventoryRows(product).some(size => size.stock <= 0);
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
      const inventory = Store.inventoryRows(product);
      const value = product.fitOptionsEnabled ? stock * product.price
        : inventory.reduce((sum, size) => sum + size.stock * (size.price || product.price), 0);
      const cost = product.fitOptionsEnabled ? stock * product.cost
        : inventory.reduce((sum, size) => sum + size.stock * size.cost, 0);
      return `
      <div class="product-row" data-product-row="${index}">
        <div class="product-row-head">
          <div class="product-info">
            <img src="${escapeHtml(product.image)}" alt="">
            <span>
              <strong>${escapeHtml(product.name)}</strong>
              <small>${escapeHtml(Store.categoryName(product.category))} · ${new Set(inventory.map(size => size.label)).size} ${product.fitOptionsEnabled ? 'shirt/trouser sizes' : 'sizes'}${product.sku ? ' · SKU ' + escapeHtml(product.sku) : ''} · ${escapeHtml(product.tag || 'No badge')}</small>
            </span>
          </div>
          <b class="status ${status.key}">${status.label}</b>
          <div class="row-actions">
            <button data-edit-product="${index}">Edit</button>
            <button class="danger" data-delete-product="${index}">Delete</button>
          </div>
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

    $$('[data-edit-product]', list).forEach(button => button.addEventListener('click', event => {
      event.preventDefault();
      try {
        openProductEditor(Number(button.dataset.editProduct));
      } catch (error) {
        console.error('[products] editor failed to open:', error);
        toast(error.message || 'Could not open this product for editing.');
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
  installLogout();
  storageBanner();
  setupBanner();
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
