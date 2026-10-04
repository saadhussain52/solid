/*
 * Solids — shared store data layer.
 * Single source of truth for the storefront and the admin workspace.
 * Store settings are persisted in localStorage. Product catalog data is also
 * synchronized with the server when its shared product API is available.
 */
(function (global) {
  'use strict';

  var KEYS = {
    products: 'solids-store-products',
    categories: 'solids-store-categories',
    collections: 'solids-store-collections',
    banners: 'solids-store-banners',
    content: 'solids-store-content',
    orders: 'solids-store-orders',
    users: 'solids-store-users',
    shipping: 'solids-store-shipping',
    /* Bumped when the saved shipping shape changes, so an older config in
       someone's browser gets normalised instead of silently read wrong. */
    version: 'solids-store-version'
  };

  var SIZE_PRESETS = {
    'Letters': ['XS', 'S', 'M', 'L', 'XL'],
    'Numeric': ['28', '30', '32', '34', '36'],
    'UK': ['6', '8', '10', '12', '14'],
    'One size': ['One Size']
  };

  var DEFAULT_SIZES = ['XS', 'S', 'M', 'L', 'XL'];
  var DEFAULT_COLORS = ['Bone', 'Black', 'Olive'];

  /* --------------------------------------------------- shipping & payments */

  /* Everything the checkout needs about delivery and payment. Admin can edit
     every figure here from the Studio dashboard; the storefront only ever
     reads it, so a change shows up on the next checkout without a deploy. */
  var DEFAULT_SHIPPING = {
    /* Charge for the cities on the studio's own route (see localCities).
       Shown to those customers as "Delivery charges". */
    deliveryFee: 150,
    /* Waive the delivery charge for own-route cities once the basket reaches
       this amount (0 = never waived). This is the figure an admin raises or
       lowers from the Delivery & payments panel. */
    freeDeliveryOver: 10000,
    /* Flat courier charge for every other city in Pakistan. Shown to those
       customers as "Shipping charges", separate from the delivery figure. */
    shippingFee: 250,
    /* Own-route cities: charged the delivery figure, not the shipping one.
       These two are the studio's own route. */
    localCities: ['Islamabad', 'Rawalpindi'],
    bankDetails: {
      title: 'Bank transfer details',
      bankName: 'Meezan Bank',
      accountTitle: 'Solids Studio (Pvt) Ltd',
      accountNumber: '0102-0107-4500-01',
      iban: 'PK36MEZN0001020107450001',
      bankCode: 'MEZN',
      branch: 'Gulberg III, Lahore',
      instructions: 'Send the transfer receipt to this email. We dispatch as soon as the amount reflects.'
    },
    supportEmail: 'solid.pk.official@gmail.com',
    supportPhone: '+92 341 2782443',
    /* Number the floating WhatsApp button opens a chat with. Digits only —
       the button builds the wa.me link from it. Edited from the admin panel's
       Delivery & payments card. */
    whatsappNumber: '923412782443',
    instagramUrl: 'https://www.instagram.com/solids.pk.official'
  };

  var PK_CITIES = [
    'Lahore', 'Karachi', 'Islamabad', 'Rawalpindi', 'Faisalabad', 'Multan',
    'Peshawar', 'Quetta', 'Sialkot', 'Gujranwala', 'Hyderabad', 'Sahiwal',
    'Abbottabad', 'Bahawalpur', 'Sargodha', 'Larkana', 'Sukkur', 'Gilgit',
    'Skardu', 'Gwadar', 'Turbat', 'Zhob', 'Chaman', 'Mingora', 'Nawabshah',
    'Rahim Yar Khan', 'Khanpur', 'Dera Ghazi Khan', 'Turbat', 'Nowshera',
    'Attock', 'Jhelum', 'Chiniot', 'Kamoke', 'Gujrat', 'Mandi Bahauddin',
    'Bhakkar', 'Layyah', 'Muzaffargarh', 'Khanewal', 'Okara', 'Kasur'
  ];

  var DEFAULT_CONTENT = {
    announcement: 'FREE DELIVERY IN ISLAMABAD & RAWALPINDI ON ORDERS ABOVE RS. 10,000 • 4–7 WORKING DAYS',
    heroEyebrow: 'THE AUTUMN EDIT / 26',
    heroTitle: 'Less, but better.',
    heroSubline: 'Quiet silhouettes, tactile layers, and a palette that lets you be the statement.',
    heroCta: 'Explore the edit',
    collectionsEyebrow: 'CURATED BY SOLIDS',
    collectionsTitle: 'Collections',
    collectionsNote: 'Considered pieces for considered days. Designed in Lahore, made for everywhere.',
    arrivalsEyebrow: 'JUST IN',
    arrivalsTitle: 'New arrivals',
    manifestoEyebrow: 'THE SOLIDS STANDARD',
    manifestoTitle: 'Clothes that give you room to live.',
    manifestoBody: 'We believe in fewer, better things. Honest fabrics, thoughtful cuts, and a slower approach to getting dressed.',
    footerTagline: 'Everyday, refined.'
  };

  var IMAGE = {
    rib: 'https://images.unsplash.com/photo-1551488831-00ddcb6c6bd3?auto=format&fit=crop&w=900&q=85',
    knit: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=900&q=85',
    linen: 'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=900&q=85',
    cotton: 'https://images.unsplash.com/photo-1485968579580-b6d095142e6e?auto=format&fit=crop&w=900&q=85',
    slip: 'https://images.unsplash.com/photo-1566174053879-31528523f8ae?auto=format&fit=crop&w=900&q=85',
    column: 'https://images.unsplash.com/photo-1539008835657-9e8e9680c956?auto=format&fit=crop&w=900&q=85',
    wrap: 'https://images.unsplash.com/photo-1496217590455-aa63a8350eea?auto=format&fit=crop&w=900&q=85',
    shirt: 'https://images.unsplash.com/photo-1605763240000-7e93b172d754?auto=format&fit=crop&w=900&q=85',
    tee: 'https://images.unsplash.com/photo-1525507119028-ed4c629a60a3?auto=format&fit=crop&w=900&q=85',
    tank: 'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=900&q=85',
    /* Was photo-1506629905607-d9f297d3e0e9, which Unsplash now 404s — every
       wide-leg product rendered a broken image. Verified live: this one loads. */
    wideLeg: 'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?auto=format&fit=crop&w=900&q=85',
    hero: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=2000&q=85',
    banner: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1600&q=85',
    fallback: 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=900&q=85'
  };

  function seededSizes(total, basePrice) {
    var labels = DEFAULT_SIZES.slice();
    var amount = Math.max(0, Number(total) || 0);
    var per = labels.length ? Math.floor(amount / labels.length) : 0;
    var extra = amount - per * labels.length;
    return labels.map(function (label, index) {
      var stock = per + (index < extra ? 1 : 0);
      return { label: label, stock: stock, cost: Math.round(basePrice * 0.45), price: basePrice };
    });
  }

  var DEFAULT_PRODUCTS = [
    { name: 'Soft Rib Co-ord', category: 'co-ord-sets', price: 12800, image: IMAGE.rib, tag: 'New', stock: 48, sold: 12, colors: ['Bone', 'Black'] },
    { name: 'Sculpt Knit Co-ord', category: 'co-ord-sets', price: 14800, image: IMAGE.knit, tag: 'New', stock: 30, sold: 24, colors: ['Bone', 'Black'] },
    { name: 'Linen Lounge Set', category: 'co-ord-sets', price: 13900, image: IMAGE.linen, tag: 'Bestseller', stock: 36, sold: 8, colors: ['Bone', 'Olive'] },
    { name: 'Sunday Cotton Set', category: 'co-ord-sets', price: 11900, image: IMAGE.cotton, tag: '', stock: 40, sold: 16, colors: ['Bone', 'Black'] },
    { name: 'Contour Slip Dress', category: 'dresses', price: 9500, image: IMAGE.slip, tag: 'New', stock: 6, sold: 9, colors: ['Black'] },
    { name: 'Oatmeal Column Dress', category: 'dresses', price: 11500, image: IMAGE.column, tag: '', stock: 24, sold: 7, colors: ['Bone'] },
    { name: 'Quiet Wrap Dress', category: 'dresses', price: 10800, image: IMAGE.wrap, tag: '', stock: 18, sold: 11, colors: ['Olive', 'Black'] },
    { name: 'Relaxed Poplin Shirt', category: 'tops', price: 6800, image: IMAGE.shirt, tag: 'Bestseller', stock: 52, sold: 31, colors: ['Bone', 'Black'] },
    { name: 'The Essential Tee', category: 'tops', price: 3900, image: IMAGE.tee, tag: 'Core', stock: 80, sold: 54, colors: ['Bone', 'Black', 'Olive'] },
    { name: 'Fine Rib Tank', category: 'tops', price: 4200, image: IMAGE.tank, tag: '', stock: 34, sold: 18, colors: ['Bone'] },
    { name: 'Daily Wide Leg', category: 'bottoms', price: 8200, image: IMAGE.wideLeg, tag: '', stock: 32, sold: 14, colors: ['Olive', 'Black'] },
    { name: 'Studio Pleat Trouser', category: 'bottoms', price: 8900, image: IMAGE.rib, tag: '', stock: 21, sold: 6, colors: ['Black'] },
    { name: 'Everyday Linen Co-ord', category: 'co-ord-sets', price: 13200, image: IMAGE.wrap, tag: 'New', stock: 28, sold: 5, colors: ['Bone', 'Olive'] }
  ];

  var META_POOL = [
    {
      description: 'Cut from a soft, breathable fabric with a relaxed, considered fit. Designed to be worn on repeat — dressed up or down, season after season.',
      reviews: [
        { name: 'Ayesha K.', rating: 5, text: 'The fit is exactly as described and the fabric feels genuinely premium.' },
        { name: 'Mariam S.', rating: 4, text: 'Lovely drape. I sized up for a looser look and love it.' }
      ],
      faqs: [
        { q: 'How does it fit?', a: 'True to size with an easy, relaxed silhouette.' },
        { q: 'How should I care for it?', a: 'Cold machine wash, hang dry and warm iron.' }
      ]
    },
    {
      description: 'An everyday essential with a quiet, elevated finish. Lightweight, breathable and made to move with you from morning to evening.',
      reviews: [{ name: 'Hina A.', rating: 5, text: 'So comfortable — I have already ordered a second one.' }],
      faqs: [
        { q: 'Is the fabric see-through?', a: 'No, it is fully lined where needed.' },
        { q: 'Do you offer exchanges?', a: 'Yes, within 14 days of delivery.' }
      ]
    },
    {
      description: 'A considered staple built from honest fabric and a refined cut, finished with subtle detailing for an effortlessly polished look.',
      reviews: [
        { name: 'Sana R.', rating: 5, text: 'Beautiful quality, exactly like the photos.' },
        { name: 'Bilal T.', rating: 4, text: 'Well made and true to size.' }
      ],
      faqs: [
        { q: 'How long is delivery?', a: 'Orders arrive within 4–7 working days.' },
        { q: 'Can I adjust the price?', a: 'Yes — each size can carry its own price.' }
      ]
    }
  ];

  var DEFAULT_CATEGORIES = ['New Arrivals', 'Co-ord Sets', 'Dresses', 'Tops', 'Bottoms'];

  var DEFAULT_COLLECTIONS = [
    { name: 'Co-ord Sets', image: IMAGE.rib },
    { name: 'Dresses', image: IMAGE.column },
    { name: 'Tops', image: IMAGE.shirt },
    { name: 'Bottoms', image: IMAGE.wideLeg }
  ];

  /* Only the first one ships live — it is what the Shop page banner reads.
     The second sits there as a spare to edit rather than a second slide, so
     there is never an ambiguous "which one is showing?". */
  var DEFAULT_BANNERS = [
    { title: 'Chapter 09', subtitle: 'End of summer', image: IMAGE.hero, active: true },
    { title: 'Monochrome', subtitle: 'Live now', image: IMAGE.banner, active: false }
  ];

  var DEFAULT_ORDERS = [
    { id: '#SOL-1048', initials: 'NR', customer: 'Noor Rehman', email: 'noor@example.com', phone: '+92 300 1234567', address: 'House 24, DHA Phase 5, Lahore', date: 'Today, 11:42 AM', items: [{ name: 'Soft Rib Co-ord', size: 'M', qty: 1, price: 12800 }], status: 'Paid', payment: 'Card ·••24' },
    { id: '#SOL-1047', initials: 'AM', customer: 'Areeba Malik', email: 'areeba@example.com', phone: '+92 321 7654321', address: 'Block B, Gulberg III, Lahore', date: 'Today, 10:16 AM', items: [{ name: 'Contour Slip Dress', size: 'S', qty: 1, price: 9500 }], status: 'Paid', payment: 'Bank transfer' },
    { id: '#SOL-1046', initials: 'HA', customer: 'Hina Ahmed', email: 'hina@example.com', phone: '+92 333 2468101', address: 'Street 8, Clifton, Karachi', date: 'Yesterday, 4:28 PM', items: [{ name: 'Sculpt Knit Co-ord', size: 'L', qty: 1, price: 14800 }], status: 'Pending', payment: 'Cash on delivery' },
    { id: '#SOL-1045', initials: 'FK', customer: 'Fatima Khan', email: 'fatima@example.com', phone: '+92 301 9876543', address: 'Sector F, Bahria Town, Islamabad', date: 'Yesterday, 2:05 PM', items: [{ name: 'Linen Lounge Set', size: 'M', qty: 1, price: 13900 }], status: 'Paid', payment: 'Card ·••81' }
  ];

  var DEFAULT_USERS = [
    { name: 'Noor Rehman', email: 'noor@example.com', orders: 6, spent: 82400, status: 'Active' },
    { name: 'Areeba Malik', email: 'areeba@example.com', orders: 3, spent: 38600, status: 'Active' },
    { name: 'Hina Ahmed', email: 'hina@example.com', orders: 2, spent: 22100, status: 'Active' },
    { name: 'Fatima Khan', email: 'fatima@example.com', orders: 1, spent: 14500, status: 'Active' }
  ];

  /* ---------------------------------------------------------------- utils */

  function read(key, fallback) {
    try {
      var raw = global.localStorage.getItem(key);
      if (raw === null || raw === undefined) return JSON.parse(JSON.stringify(fallback));
      var parsed = JSON.parse(raw);
      return parsed === null || parsed === undefined ? JSON.parse(JSON.stringify(fallback)) : parsed;
    } catch (error) {
      return JSON.parse(JSON.stringify(fallback));
    }
  }

  /* localStorage is only ~5MB and product photos are stored inline as base64, so a
     save can genuinely fail with QuotaExceededError. That error used to be swallowed
     here: the admin clicked "Save product", saw a success toast, and then found the
     product gone after a refresh. write() now reports the failure, keeps the message
     for the banner, and notifies anything listening. */
  var lastWriteError = null;
  var storageListeners = [];

  function onStorageError(listener) { storageListeners.push(listener); }

  function announce(message) {
    lastWriteError = message;
    storageListeners.forEach(function (listener) {
      try { listener(lastWriteError); } catch (ignored) { /* a bad listener must not break a save */ }
    });
  }

  function clearStorageError() { announce(null); }

  /* Product photos are the only thing big enough to blow the ~5MB quota, so when a
     write is refused the culprit is always this key. It is also the only key whose
     contents are a *copy*: Railway is the source of truth, so dropping the copy is
     safe and frees the space the rest of the app needs. */
  function dropProductCache() {
    try {
      global.localStorage.removeItem(KEYS.products);
      return true;
    } catch (error) {
      return false;
    }
  }

  function write(key, value) {
    /* Never mirror the catalogue into the browser once Railway answers for it.
       Older builds did that, which is how the browser filled up with base64
       photos and started warning even though the site itself was live. */
    if (key === KEYS.products && api && api.productsOnline) {
      lastWriteError = null;
      return true;
    }
    try {
      global.localStorage.setItem(key, JSON.stringify(value));
      lastWriteError = null;
      return true;
    } catch (error) {
      if (error && error.name === 'QuotaExceededError' && key !== KEYS.products && dropProductCache()) {
        /* One retry after freeing the stale product copy; only give up if the
           refusal had nothing to do with photos. */
        try {
          global.localStorage.setItem(key, JSON.stringify(value));
          lastWriteError = null;
          return true;
        } catch (retryError) { /* fall through to the report below */ }
      }
      lastWriteError = (error && error.name === 'QuotaExceededError')
        ? 'This browser is out of storage space. Product photos now live on Cloudinary and Railway, so use a smaller image and reload this page.'
        : 'This browser is blocking storage (private mode?), so nothing was saved.';
      announce(lastWriteError);
      return false;
    }
  }

  function slugify(value) {
    return String(value == null ? '' : value).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function money(value) {
    return 'Rs. ' + Math.round(Number(value) || 0).toLocaleString('en-PK');
  }

  function num(value, fallbackValue) {
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : (fallbackValue || 0);
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function escapeAttr(value) { return escapeHtml(value); }

  /* --------------------------------------------------------- normalising */

  function normalizeSize(entry, index, product) {
    if (typeof entry === 'string' || typeof entry === 'number') {
      return { label: String(entry).trim(), stock: 0, cost: Math.round(num(product.price) * 0.45), price: num(product.price), sold: 0 };
    }
    var label = String((entry && (entry.label || entry.size)) || ('Size ' + (index + 1))).trim();
    var rawPrice = entry && entry.price;
    return {
      label: label,
      stock: Math.max(0, num(entry && entry.stock)),
      cost: Math.max(0, num(entry && entry.cost, Math.round(num(product.price) * 0.45))),
      price: rawPrice === '' || rawPrice == null || !Number.isFinite(Number(rawPrice)) ? num(product.price) : Number(rawPrice),
      sold: Math.max(0, num(entry && entry.sold))
    };
  }

  function normalizeProduct(product, index) {
    var base = Object.assign({}, product || {});
    var meta = META_POOL[index % META_POOL.length];
    var price = Math.max(0, num(base.price));
    var legacySizes = Array.isArray(base.sizes) ? base.sizes : null;

    if (legacySizes && legacySizes.length) {
      base.sizes = legacySizes.map(function (entry, position) { return normalizeSize(entry, position, base); });
    } else {
      // Legacy shape: total stock on the product + per-size price map.
      var total = num(base.stock, [48, 6, 32, 18][index % 4]);
      var labels = (Array.isArray(base.sizeList) && base.sizeList.length) ? base.sizeList : DEFAULT_SIZES;
      var priceMap = base.sizePrice || {};
      base.sizes = labels.map(function (label, position) {
        var legacyStock = base.sizeStock && Object.prototype.hasOwnProperty.call(base.sizeStock, label)
          ? num(base.sizeStock[label])
          : null;
        var per = Math.max(1, Math.round(total / labels.length));
        return {
          label: label,
          stock: legacyStock == null ? (position === 1 && index % 3 === 1 ? 0 : per) : legacyStock,
          cost: Math.round(price * 0.45),
          price: num(priceMap[label], price),
          sold: 0
        };
      });
    }

    base.name = String(base.name || 'Untitled product').trim();
    base.price = price;
    base.category = slugify(base.category || 'co-ord-sets');
    base.image = base.image || IMAGE.fallback;
    base.tag = base.tag || '';
    base.sold = Math.max(0, num(base.sold));
    base.colors = (Array.isArray(base.colors) && base.colors.length) ? base.colors : DEFAULT_COLORS.slice();
    base.gallery = (Array.isArray(base.gallery) && base.gallery.length) ? base.gallery : [base.image];
    /* Optional exact colour previews: images are variant photos; masks are
       transparent garment silhouettes aligned with the main product image. */
    base.colorImages = base.colorImages && typeof base.colorImages === 'object' && !Array.isArray(base.colorImages) ? base.colorImages : {};
    base.colorMasks = base.colorMasks && typeof base.colorMasks === 'object' && !Array.isArray(base.colorMasks) ? base.colorMasks : {};
    base.description = base.description || meta.description;
    base.reviews = (Array.isArray(base.reviews) && base.reviews.length) ? base.reviews : meta.reviews;
    base.faqs = (Array.isArray(base.faqs) && base.faqs.length) ? base.faqs : meta.faqs;
    if (base.cost == null || !Number.isFinite(Number(base.cost))) {
      base.cost = Math.round(price * 0.45);
    } else {
      base.cost = Math.max(0, num(base.cost));
    }
    delete base.sizeStock;
    delete base.sizePrice;
    delete base.variantStock;
    return base;
  }

  /* ------------------------------------------------------------- the store */

  var state = {
    products: read(KEYS.products, DEFAULT_PRODUCTS).map(normalizeProduct),
    categories: read(KEYS.categories, DEFAULT_CATEGORIES),
    collections: read(KEYS.collections, DEFAULT_COLLECTIONS),
    banners: read(KEYS.banners, DEFAULT_BANNERS),
    content: Object.assign({}, DEFAULT_CONTENT, read(KEYS.content, DEFAULT_CONTENT)),
    orders: read(KEYS.orders, DEFAULT_ORDERS),
    users: read(KEYS.users, DEFAULT_USERS),
    shipping: normalizeShipping(read(KEYS.shipping, DEFAULT_SHIPPING))
  };

  function normalizeShipping(config) {
    var saved = config || {};
    var base = Object.assign({}, DEFAULT_SHIPPING, saved);
    base.bankDetails = Object.assign({}, DEFAULT_SHIPPING.bankDetails, saved.bankDetails);
    /* Older saves listed the own-route cities under freeCities, back when they
       cost nothing to deliver. Only adopt that list when the save genuinely
       has no localCities — otherwise an admin's own-route city (say Attock)
       would silently fall back to the shipping tier and start being
       charged the courier rate. */
    if (!Array.isArray(saved.localCities) && Array.isArray(saved.freeCities)) {
      base.localCities = saved.freeCities;
    }
    ['deliveryFee', 'freeDeliveryOver', 'shippingFee']
      .forEach(function (key) { base[key] = Math.max(0, num(base[key])); });
    /* Payment-method fees are no longer charged, so drop the stale keys
       instead of leaving them to accumulate in saved config. */
    delete base.codFee;
    delete base.bankFee;
    delete base.codDiscount;
    delete base.codDiscountOver;
    delete base.freeCities;
    /* There is no remote-area surcharge any more — only the two tiers. */
    delete base.remoteFee;
    delete base.remoteCities;
    /* The floating WhatsApp button builds a wa.me link, which needs digits only
       and no "+". Admin types whatever is comfortable ("+92 341 2782443"), so
       strip everything else instead of producing a broken chat link. */
    base.whatsappNumber = String(base.whatsappNumber || '').replace(/\D/g, '');
    if (!/^\d{8,15}$/.test(base.whatsappNumber)) {
      base.whatsappNumber = DEFAULT_SHIPPING.whatsappNumber;
    }
    return base;
  }

  function save(part) {
    /* Returns false when localStorage refused the write, so a caller can report
       the failure instead of assuming the change was stored. */
    if (part && state[part]) return write(KEYS[part], state[part]);
    var ok = true;
    Object.keys(KEYS).forEach(function (key) {
      if (key === 'version') return;
      if (state[key] && !write(KEYS[key], state[key])) ok = false;
    });
    return ok;
  }

  /* ---------------------------------------------------------- derivations */

  function sizeOf(product, label) {
    var found = null;
    (product.sizes || []).forEach(function (size) { if (size.label === label) found = size; });
    return found;
  }

  function stockFor(product, label) {
    var size = sizeOf(product, label);
    return size ? size.stock : 0;
  }

  function priceFor(product, label) {
    var size = sizeOf(product, label);
    return size && size.price > 0 ? size.price : num(product.price);
  }

  function costFor(product, label) {
    var size = sizeOf(product, label);
    return size ? size.cost : num(product.cost);
  }

  function totalStock(product) {
    return (product.sizes || []).reduce(function (sum, size) { return sum + (Number(size.stock) || 0); }, 0);
  }

  function totalSold(product) {
    return (product.sizes || []).reduce(function (sum, size) { return sum + (Number(size.sold) || 0); }, 0) || num(product.sold);
  }

  function priceRange(product) {
    var values = (product.sizes || []).map(function (size) { return size.price > 0 ? size.price : num(product.price); });
    if (!values.length) values = [num(product.price)];
    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);
    return min === max ? money(min) : money(min) + ' – ' + money(max);
  }

  function categoryName(slug) {
    for (var i = 0; i < state.categories.length; i += 1) {
      if (slugify(state.categories[i]) === slug) return state.categories[i];
    }
    return slug;
  }

  function productStatus(product) {
    var stock = totalStock(product);
    if (stock <= 0) return { key: 'sold-out', label: 'Sold out' };
    if (stock <= 10) return { key: 'low-stock', label: 'Low stock' };
    return { key: 'in-stock', label: 'In stock' };
  }

  function activeBanner() {
    for (var i = 0; i < state.banners.length; i += 1) {
      if (state.banners[i].active) return state.banners[i];
    }
    /* Every banner was switched off. Falling back to the first one means the
       shop page keeps a banner instead of silently showing a bare gap. */
    return state.banners[0] || null;
  }

  /* ------------------------------------------------------------- mutations */

  function upsertProduct(payload) {
    var index = Number(payload.id);
    var sizes = (payload.sizes || []).filter(function (size) { return size.label; });
    var record = {
      name: payload.name,
      description: payload.description || '',
      category: slugify(payload.category),
      image: payload.image || IMAGE.fallback,
      gallery: (payload.gallery && payload.gallery.length ? payload.gallery : [payload.image || IMAGE.fallback]),
      colorImages: payload.colorImages || (state.products[index] && state.products[index].colorImages) || {},
      colorMasks: payload.colorMasks || (state.products[index] && state.products[index].colorMasks) || {},
      tag: payload.tag || '',
      colors: payload.colors && payload.colors.length ? payload.colors : DEFAULT_COLORS.slice(),
      price: num(payload.price),
      cost: num(payload.cost),
      sold: sizes.reduce(function (sum, size) { return sum + (Number(size.sold) || 0); }, 0),
      sizes: sizes.map(function (size) {
        return {
          label: size.label,
          stock: Math.max(0, num(size.stock)),
          cost: Math.max(0, num(size.cost)),
          price: Math.max(0, num(size.price, num(payload.price))),
          sold: Math.max(0, num(size.sold))
        };
      }),
      reviews: payload.reviews || [],
      faqs: payload.faqs || []
    };
    record.sold = record.sold || num(payload.sold);
    /* The old product record has to be kept until the write succeeds. If storage
       is full, setItem throws and the in-memory list would keep the new product
       while the page keeps the old one — a save that looks fine but silently
       reverts on refresh. So build the candidate list, persist it, and only
       commit to state once it is safely on disk. */
    var editing = index >= 0 && state.products[index];
    if (editing) {
      record.reviews = record.reviews.length ? record.reviews : state.products[index].reviews;
      record.faqs = record.faqs.length ? record.faqs : state.products[index].faqs;
    } else {
      var meta = META_POOL[state.products.length % META_POOL.length];
      record.reviews = record.reviews.length ? record.reviews : meta.reviews;
      record.faqs = record.faqs.length ? record.faqs : meta.faqs;
    }
    var next = state.products.slice();
    if (editing) {
      next[index] = record;
    } else {
      next.push(record);
      index = next.length - 1;
    }
    if (!api.productsOnline && !write(KEYS.products, next)) return -1;
    state.products = next;
    return index;
  }

  function removeProduct(index) {
    var next = state.products.slice();
    next.splice(index, 1);
    if (!api.productsOnline && !write(KEYS.products, next)) return false;
    state.products = next;
    return true;
  }

  function restock(productId, label, amount, mode) {
    var product = state.products[productId];
    if (!product) return;
    var size = sizeOf(product, label);
    if (!size) return;
    var value = num(amount);
    size.stock = Math.max(0, mode === 'set' ? value : size.stock + value);
    if (!api.productsOnline) save('products');
  }

  function addCategory(name) {
    var trimmed = String(name || '').trim();
    if (!trimmed || state.categories.indexOf(trimmed) !== -1) return false;
    state.categories.push(trimmed);
    if (state.collections.every(function (item) { return slugify(item.name) !== slugify(trimmed); })) {
      state.collections.push({ name: trimmed, image: '' });
    }
    save();
    return true;
  }

  function renameCategory(oldName, newName) {
    var trimmed = String(newName || '').trim();
    if (!trimmed || trimmed === oldName || state.categories.indexOf(trimmed) !== -1) return false;
    var oldSlug = slugify(oldName);
    var newSlug = slugify(trimmed);
    state.categories = state.categories.map(function (item) { return item === oldName ? trimmed : item; });
    state.products.forEach(function (product) { if (product.category === oldSlug) product.category = newSlug; });
    state.collections.forEach(function (item) { if (slugify(item.name) === oldSlug) item.name = trimmed; });
    save();
    return true;
  }

  function removeCategory(name) {
    var slug = slugify(name);
    if (state.products.some(function (product) { return product.category === slug; })) return false;
    state.categories = state.categories.filter(function (item) { return item !== name; });
    state.collections = state.collections.filter(function (item) { return slugify(item.name) !== slug; });
    save();
    return true;
  }

  function upsertCollection(index, payload) {
    if (index < 0 || !state.collections[index]) {
      state.collections.push({ name: payload.name, image: payload.image || '' });
    } else {
      state.collections[index] = { name: payload.name, image: payload.image || '' };
    }
    save('collections');
  }

  function removeCollection(index) {
    state.collections.splice(index, 1);
    save('collections');
  }

  function upsertBanner(index, payload) {
    if (index < 0 || !state.banners[index]) {
      state.banners.push({ title: payload.title, subtitle: payload.subtitle || '', image: payload.image || IMAGE.banner, active: payload.active !== false });
    } else {
      state.banners[index] = {
        title: payload.title,
        subtitle: payload.subtitle || '',
        image: payload.image || state.banners[index].image,
        active: payload.active !== false
      };
    }
    save('banners');
  }

  function removeBanner(index) {
    state.banners.splice(index, 1);
    save('banners');
  }

  function toggleBanner(index) {
    if (state.banners[index]) {
      state.banners[index].active = !state.banners[index].active;
      save('banners');
    }
  }

  function setContent(patch) {
    state.content = Object.assign({}, state.content, patch);
    save('content');
  }

  function setOrderStatus(index, status) {
    if (!state.orders[index]) return;
    state.orders[index].status = status;
    save('orders');
  }

  function setUserStatus(index, status) {
    if (!state.users[index]) return;
    state.users[index].status = status;
    save('users');
  }

  function createOrder(details) {
    var sequence = 1048 + state.orders.length + 1;
    var id = '#SOL-' + sequence;
    var initials = String(details.customer || 'Guest')
      .split(' ').filter(Boolean).slice(0, 2)
      .map(function (part) { return part[0].toUpperCase(); }).join('') || 'G';
    var order = {
      id: id,
      initials: initials,
      customer: details.customer || 'Guest customer',
      email: details.email || '',
      phone: details.phone || '',
      address: details.address || '',
      city: details.city || '',
      notes: details.notes || '',
      trackingId: details.trackingId || makeTrackingId(),
      date: 'Today, just now',
      items: details.items || [],
      status: details.status || 'Paid',
      payment: details.payment || 'Cash on delivery',
      /* Frozen at checkout time so a later admin fee change never rewrites
         what an existing customer agreed to pay. */
      shipping: details.shipping || null
    };
    state.orders.unshift(order);
    save('orders');

    // Record the customer so the directory grows with real checkouts.
    var email = (details.email || '').toLowerCase();
    if (email) {
      var existing = state.users.filter(function (user) { return String(user.email).toLowerCase() === email; })[0];
      /* Customer spend is goods only — delivery is what we pay, not what they
         earned us, so it stays out of the lifetime-value figure. */
      var spend = order.items.reduce(function (sum, item) { return sum + (num(item.price) * num(item.qty, 1)); }, 0);
      if (existing) {
        existing.orders += 1;
        existing.spent += spend;
      } else {
        state.users.unshift({ name: order.customer, email: details.email, orders: 1, spent: spend, status: 'Active' });
      }
      save('users');
    }

    // Reduce stock, increase sold units, for each purchased line.
    (order.items || []).forEach(function (item) {
      var product = state.products.filter(function (candidate) { return candidate.name === item.name; })[0];
      if (!product) return;
      var size = sizeOf(product, item.size);
      if (size) {
        size.stock = Math.max(0, size.stock - num(item.qty, 1));
        size.sold = num(size.sold) + num(item.qty, 1);
        product.sold = totalSold(product);
      } else {
        product.stock = Math.max(0, num(product.stock) - num(item.qty, 1));
        product.sold = num(product.sold) + num(item.qty, 1);
      }
    });
    if (!api.productsOnline) save('products');
    return order;
  }

  /* Merge an order that the server is holding but this browser has not seen —
     this is what makes the emailed tracking link work when it is opened on a
     different device. Matched on the order number, which is the reference the
     customer pasted, and the server's copy wins field by field so a status
     change made in the studio is what the customer sees. */
  function adoptOrder(incoming) {
    if (!incoming || !incoming.id) return null;
    var needle = String(incoming.id).trim().toLowerCase().replace(/^#/, '');
    var index = state.orders.map(function (order) {
      return String(order.id || '').trim().toLowerCase().replace(/^#/, '');
    }).indexOf(needle);
    if (index === -1) {
      state.orders.unshift(JSON.parse(JSON.stringify(incoming)));
    } else {
      state.orders[index] = Object.assign({}, state.orders[index], incoming);
    }
    save('orders');
    return state.orders[index === -1 ? 0 : index];
  }

  /* ------------------------------------------------------------- shipping */

  /* Single source of truth for what an order costs to deliver. Both the
     checkout summary and the admin preview call this, so the figure the
     customer sees is the figure that gets stored on the order.

     Two tiers, and the label is part of the quote so every screen agrees:
     own-route cities (Islamabad, Rawalpindi) are charged the delivery fee,
     every other city in Pakistan is charged the shipping fee. Own-route
     orders above the admin-set threshold get delivery free. */
  function shippingQuote(options) {
    var opts = options || {};
    var config = state.shipping;
    var subtotal = Math.max(0, num(opts.subtotal));
    var city = String(opts.city || '');
    var matches = function (name) {
      return String(name).trim().toLowerCase() === city.trim().toLowerCase();
    };
    /* Islamabad and Rawalpindi sit on the studio's own route, so they are
       billed the delivery figure. Every other city in Pakistan ships by
       courier and is billed the shipping figure. */
    var isLocal = !!city && config.localCities.some(matches);

    var label = isLocal ? 'Delivery charges' : 'Shipping charges';
    var baseFee = isLocal ? config.deliveryFee : config.shippingFee;

    /* The free-delivery threshold only ever applied to own-route cities —
       free to hand over in Lahore is a real cost, so it does not extend. */
    var waived = isLocal && config.freeDeliveryOver > 0 && subtotal >= config.freeDeliveryOver;
    var delivery = waived ? 0 : baseFee;

    var total = subtotal + delivery;
    return {
      subtotal: subtotal,
      delivery: delivery,
      /* The two figures, kept apart so a receipt or the admin can show which
         tier this order was billed on. */
      deliveryFee: config.deliveryFee,
      shippingFee: config.shippingFee,
      label: label,
      baseFee: baseFee,
      freeOver: config.freeDeliveryOver,
      waived: waived,
      isLocalCity: isLocal,
      total: Math.max(0, total)
    };
  }

  /* Human tracking reference the customer quotes over email or the phone. */
  function makeTrackingId() {
    var stamp = Date.now().toString(36).toUpperCase().slice(-5);
    var rand = Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    return 'SLD' + stamp + rand;
  }

  function saveShipping(config) {
    state.shipping = normalizeShipping(Object.assign({}, state.shipping, config || {}));
    write(KEYS.shipping, state.shipping);
    return state.shipping;
  }

  function orderTotal(order) {
    var goods = (order.items || []).reduce(function (sum, item) {
      return sum + num(item.price) * num(item.qty, 1);
    }, 0);
    var shipping = (order && order.shipping) || {};
    /* delivery is the full charge for this order's tier — a waived order stores
       0 — so nothing is added on top here. Orders placed before this shape
       still carry the older methodFee/discount keys, which num() reads as 0. */
    var extra = num(shipping.delivery);
    return goods + Math.max(0, extra);
  }

  /* ------------------------------------------------------------ analytics */

  function analytics() {
    var products = state.products;
    var unitsInStock = products.reduce(function (sum, product) { return sum + totalStock(product); }, 0);
    var unitsSold = products.reduce(function (sum, product) { return sum + totalSold(product); }, 0);
    var stockValue = products.reduce(function (sum, product) {
      return sum + (product.sizes || []).reduce(function (inner, size) {
        return inner + (Number(size.stock) || 0) * (size.price > 0 ? size.price : num(product.price));
      }, 0);
    }, 0);
    var costValue = products.reduce(function (sum, product) {
      return sum + (product.sizes || []).reduce(function (inner, size) {
        return inner + (Number(size.stock) || 0) * num(size.cost);
      }, 0);
    }, 0);
    var revenue = state.orders.reduce(function (sum, order) {
      return sum + (order.status === 'Cancelled' ? 0 : orderTotal(order));
    }, 0);
    var outOfStockSizes = [];
    products.forEach(function (product) {
      (product.sizes || []).forEach(function (size) {
        if (size.stock <= 0) outOfStockSizes.push({ product: product.name, size: size.label });
      });
    });
    return {
      productCount: products.length,
      unitsInStock: unitsInStock,
      unitsSold: unitsSold,
      stockValue: stockValue,
      costValue: costValue,
      potentialProfit: stockValue - costValue,
      revenue: revenue,
      orderCount: state.orders.length,
      customerCount: state.users.length,
      pendingCount: state.orders.filter(function (order) { return order.status === 'Pending'; }).length,
      lowStockCount: products.filter(function (product) {
        var stock = totalStock(product);
        return stock > 0 && stock <= 10;
      }).length,
      soldOutCount: products.filter(function (product) { return totalStock(product) <= 0; }).length,
      outOfStockSizes: outOfStockSizes,
      averageOrder: state.orders.length ? revenue / state.orders.length : 0
    };
  }

  function resetAll() {
    state.products = DEFAULT_PRODUCTS.map(normalizeProduct);
    state.categories = DEFAULT_CATEGORIES.slice();
    state.collections = JSON.parse(JSON.stringify(DEFAULT_COLLECTIONS));
    state.banners = JSON.parse(JSON.stringify(DEFAULT_BANNERS));
    state.content = JSON.parse(JSON.stringify(DEFAULT_CONTENT));
    state.orders = JSON.parse(JSON.stringify(DEFAULT_ORDERS));
    state.users = JSON.parse(JSON.stringify(DEFAULT_USERS));
    state.shipping = normalizeShipping(DEFAULT_SHIPPING);
    save();
  }

  /* ------------------------------------------------------------------- api */

  /* The storefront is static HTML, so the order API is optional rather than
     required. Everything here resolves either way: if server.js is not
     running, callers fall back to this browser's own copy so a customer can
     still check out on a plain file:// page or a static host. */
  var api = {
    /* True once a request to the API has actually succeeded, so the
       confirmation screen can be honest about whether mail was sent. */
    online: false,
    productsOnline: false,
    productsConfigured: false,
    adminEditingEnabled: false,
    configPromise: null,

    /* The admin session lives in an HttpOnly cookie the server set at login, so
       there is nothing to ask for and nothing to keep in the page. Checking the
       server first means an expired session redirects to the login form instead
       of failing with a confusing write error. */
    session: function () {
      return fetch('/api/admin/session')
        .then(function (response) { return response.json(); })
        .catch(function () { return { ok: false, signedIn: false, configured: false }; });
    },

    /* Whether the owner has finished wiring up login on the server. Without it
       the admin pages cannot be opened at all, so the login screen has to say
       so plainly instead of silently failing. */
    serverConfig: function () {
      if (api.configPromise) return api.configPromise;
      api.configPromise = fetch('/api/config')
        .then(function (response) { return response.json(); })
        .then(function (data) {
          api.adminEditingEnabled = !!data.adminEditing;
          return data;
        })
        .catch(function () {
          api.adminEditingEnabled = false;
          return { adminEditing: false };
        });
      return api.configPromise;
    },

    loadProducts: function () {
      return fetch('/api/products')
        .then(function (response) {
          if (!response.ok) throw new Error('Product API ' + response.status);
          return response.json();
        })
        .then(function (data) {
          api.productsOnline = true;
          api.productsConfigured = !!data.configured;
          if (Array.isArray(data.products)) {
            state.products = data.products.map(normalizeProduct);
            global.dispatchEvent(new CustomEvent('store:products-loaded'));
          }
          return { online: true, configured: api.productsConfigured };
        })
        .catch(function (error) {
          api.productsOnline = false;
          api.productsConfigured = false;
          return { online: false, configured: false, error: error.message };
        });
    },

    /* A 401 anywhere means the session expired or was signed out. Sending the
       browser back to the login form is the only honest response; trying to
       continue would just fail again on the next write. */
    sendToLogin: function () {
      if (global.location && global.location.pathname.indexOf('admin-login') === -1) {
        global.location.replace('/admin-login.html?next=' + encodeURIComponent(global.location.pathname));
      }
    },

    loadAdminProducts: function () {
      return fetch('/api/products?admin=1', { credentials: 'same-origin' })
        .then(function (response) {
          return response.json().then(function (data) {
            if (response.status === 401) {
              api.sendToLogin();
              throw new Error('Please sign in to the admin panel.');
            }
            if (response.status === 503) {
              throw new Error('Admin login is not set up on Railway yet. Add ADMIN_USERNAME and ADMIN_PASSWORD to the service Variables, then redeploy.');
            }
            if (!response.ok) throw new Error(data.error || 'Could not load the shared product catalogue.');
            api.productsOnline = true;
            api.productsConfigured = !!data.configured;
            if (Array.isArray(data.products)) {
              state.products = data.products.map(normalizeProduct);
              global.dispatchEvent(new CustomEvent('store:products-loaded'));
            }
            return { online: true, configured: api.productsConfigured };
          });
        });
    },

    saveProducts: function (products, initialize) {
      return fetch('/api/products', {
        method: initialize ? 'POST' : 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: products })
      }).then(function (response) {
        return response.json().then(function (data) {
          if (response.status === 401) {
            api.sendToLogin();
            throw new Error('Please sign in to the admin panel.');
          }
          if (!response.ok) throw new Error(data.error || 'Could not save products to the server.');
          api.productsOnline = true;
          api.productsConfigured = true;
          return data;
        });
      });
    },

    /* Uploads the image to our own server and resolves with the stored URL. No
       Cloudinary account or API secret is involved, so a fresh deploy can add
       products as soon as the admin login is set up. */
    uploadImage: function (source) {
      return fetch(source).then(function (sourceResponse) { return sourceResponse.blob(); }).then(function (blob) {
        if (!blob || !blob.type.startsWith('image/')) {
          return Promise.reject(new Error('That file is not an image. Please pick a PNG or JPG.'));
        }
        return fetch('/api/upload?type=' + encodeURIComponent(blob.type), {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: blob
        });
      }).then(function (response) {
        return response.json().then(function (data) {
          if (response.status === 401) {
            api.sendToLogin();
            throw new Error('Please sign in to the admin panel.');
          }
          if (response.status === 503) {
            throw new Error('Admin login is not set up on Railway yet. Add ADMIN_USERNAME and ADMIN_PASSWORD to the service Variables, then redeploy.');
          }
          if (!response.ok || !data.url) throw new Error(data.error || 'Could not upload the image.');
          return data.url;
        });
      });
    },

    /* POST an order. Resolves { ok, order, emailSent, trackUrl }; `order` is
       the server's copy when it answered, otherwise the caller's local one. */
    create: function (payload) {
      return fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(function (response) {
          if (!response.ok) throw new Error('API ' + response.status);
          return response.json();
        })
        .then(function (data) {
          api.online = true;
          return api.loadProducts().then(function () { return data; });
        });
    },

    /* GET an order by tracking ID, order number, or the customer's email. */
    lookup: function (reference) {
      return fetch('/api/orders/' + encodeURIComponent(reference))
        .then(function (response) {
          /* A genuine "no such order" is an answer, not a failure. */
          if (response.status === 404) return { ok: false, order: null };
          if (!response.ok) throw new Error('API ' + response.status);
          return response.json();
        })
        .then(function (data) {
          api.online = true;
          return data;
        });
    }
  };

  global.Store = {
    KEYS: KEYS,
    DEFAULT_CONTENT: DEFAULT_CONTENT,
    SIZE_PRESETS: SIZE_PRESETS,
    IMAGE: IMAGE,
    money: money,
    slugify: slugify,
    escapeHtml: escapeHtml,
    escapeAttr: escapeAttr,
    num: num,
    read: read,
    write: write,
    /* Lets the admin panel show a persistent banner instead of a toast that
       disappears, when a write to localStorage was refused. */
    storageError: function () { return lastWriteError; },
    onStorageError: onStorageError,
    /* A save that reached Railway proves the browser is fine, so a banner left over
       from an earlier failed local write has to come down. */
    clearStorageError: clearStorageError,
    releaseProductCache: dropProductCache,
    state: state,
    save: save,
    sizeOf: sizeOf,
    stockFor: stockFor,
    priceFor: priceFor,
    costFor: costFor,
    totalStock: totalStock,
    totalSold: totalSold,
    priceRange: priceRange,
    categoryName: categoryName,
    productStatus: productStatus,
    activeBanner: activeBanner,
    upsertProduct: upsertProduct,
    removeProduct: removeProduct,
    restock: restock,
    addCategory: addCategory,
    renameCategory: renameCategory,
    removeCategory: removeCategory,
    upsertCollection: upsertCollection,
    removeCollection: removeCollection,
    upsertBanner: upsertBanner,
    removeBanner: removeBanner,
    toggleBanner: toggleBanner,
    setContent: setContent,
    setOrderStatus: setOrderStatus,
    setUserStatus: setUserStatus,
    createOrder: createOrder,
    adoptOrder: adoptOrder,
    orderTotal: orderTotal,
    analytics: analytics,
    shippingQuote: shippingQuote,
    saveShipping: saveShipping,
    makeTrackingId: makeTrackingId,
    api: api,
    PK_CITIES: PK_CITIES,
    resetAll: resetAll
  };

  api.productsReady = api.loadProducts();
  write(KEYS.version, '2');
})(window);
