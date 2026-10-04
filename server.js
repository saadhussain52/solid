/*
 * Solids storefront server.
 *
 * The site itself is plain static HTML/JS, but two features it promises cannot
 * work without a server:
 *   1. emailing the customer their tracking link
 *   2. tracking an order from a different device (the browser's own copy of an
 *      order lives in localStorage, which does not travel with an email)
 * So this serves the static files AND exposes JSON APIs for orders and the
 * shared product catalogue, backed by files in the configured data directory.
 *
 * Usage:
 *   node server.js            -> http://localhost:5173
 *   PORT=3000 node server.js   -> http://localhost:3000
 *
 * Email is optional. Without RESEND_API_KEY the site still works and orders are
 * still saved; the confirmation screen falls back to opening the customer's
 * mail app with the tracking link already filled in, exactly as before.
 *
 * No dependencies: plain Node.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = __dirname;

/* ------------------------------------------------------------ environment */

/* Reads a .env file by hand so this server needs no dependency at all. Real
   environment variables always win over whatever the file says. */
const loadDotEnv = () => {
  try {
    const raw = fs.readFileSync(path.join(root, '.env'), 'utf8');
    raw.split(/\r?\n/).forEach(line => {
      const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (!match) return;
      let value = match[2].trim();
      /* Strip matching quotes so "a b" and 'a b' both work. */
      if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
      if (!(match[1] in process.env)) process.env[match[1]] = value;
    });
  } catch (error) {
    /* No .env file is fine — every setting has a default or stays optional. */
  }
};
loadDotEnv();

const PORT = Number(process.env.PORT) || 5173;
/* Absolute base used inside tracking links. Set this in production, e.g.
   SITE_URL=https://yourdomain.com — otherwise the request host is used. */
const SITE_URL = String(process.env.SITE_URL || '').replace(/\/+$/, '');
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const MAIL_FROM = process.env.MAIL_FROM || 'Solids <onboarding@resend.dev>';
/* Where the order alert goes. Optional. */
const STUDIO_EMAIL = process.env.STUDIO_EMAIL || 'solid.pk.official@gmail.com';
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || '';
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || '';
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || '';

const money = value => 'Rs. ' + Math.round(Number(value) || 0).toLocaleString('en-PK');
/* --------------------------------------------------------------- storage */

/* Where orders live. DATA_DIR lets a host point this at a mounted persistent
   volume, because most cloud filesystems are wiped on every deploy or restart
   and every order would vanish with them. Defaults to ./data locally. */
const dataDir = process.env.DATA_DIR
  ? path.resolve(root, process.env.DATA_DIR)
  : path.join(root, 'data');
const ordersFile = path.join(dataDir, 'orders.json');
const productsFile = path.join(dataDir, 'products.json');
/* Product photos live here. Keeping them on the same volume as the catalogue
   means the site works without any third-party image account: the admin picks a
   file, the server stores it, and the catalogue only ever holds a short URL. */
const uploadsDir = path.join(dataDir, 'uploads');

/* Orders live in one JSON file. Reads are cached in memory and every write
   goes to a temp file first, then replaces the original, so a crash mid-write
   cannot leave a half-written orders file behind. */
let ordersCache = null;

const loadOrders = () => {
  if (ordersCache) return ordersCache;
  try {
    ordersCache = JSON.parse(fs.readFileSync(ordersFile, 'utf8'));
    if (!Array.isArray(ordersCache)) ordersCache = [];
  } catch (error) {
    ordersCache = [];
  }
  return ordersCache;
};

const saveOrders = orders => {
  fs.mkdirSync(dataDir, { recursive: true });
  const temp = ordersFile + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(orders, null, 2));
  fs.renameSync(temp, ordersFile);
  ordersCache = orders;
};

let productsCache;

const loadProducts = () => {
  if (productsCache !== undefined) return productsCache;
  try {
    productsCache = JSON.parse(fs.readFileSync(productsFile, 'utf8'));
    if (!Array.isArray(productsCache)) throw new Error('Product data is not an array');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  return productsCache;
};

const saveProducts = products => {
  fs.mkdirSync(dataDir, { recursive: true });
  const temp = productsFile + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(products, null, 2));
  fs.renameSync(temp, productsFile);
  productsCache = products;
};

const requireAdmin = (req, res) => {
  const expected = process.env.ADMIN_KEY || '';
  const supplied = String(req.headers['x-admin-key'] || '');
  if (!expected) {
    json(res, 503, { ok: false, error: 'Product editing is locked. Set ADMIN_KEY in Railway variables.' });
    return false;
  }
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  if (expectedBuffer.length !== suppliedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, suppliedBuffer)) {
    json(res, 401, { ok: false, error: 'Admin key is incorrect.' });
    return false;
  }
  return true;
};

const publicProducts = products => products && products.map(product => {
  const visible = { ...product };
  delete visible.cost;
  if (Array.isArray(visible.sizes)) {
    visible.sizes = visible.sizes.map(size => {
      const visibleSize = { ...size };
      delete visibleSize.cost;
      return visibleSize;
    });
  }
  return visible;
});

/* Look up by tracking ID, order number, or the email it was sent to — the
   three things a customer actually has in front of them. */
const findOrder = reference => {
  const needle = String(reference || '').trim().toLowerCase();
  if (!needle) return null;
  const bare = needle.replace(/^#/, '');
  return loadOrders().find(order =>
    String(order.trackingId || '').toLowerCase() === needle ||
    String(order.id || '').toLowerCase().replace(/^#/, '') === bare
  ) || null;
};

/* An email names every order that customer has placed, not just the newest.
   A repeat customer tracking a parcel from last week would otherwise be shown
   their most recent, unrelated order and conclude the wrong parcel is late. */
const findOrdersByEmail = reference => {
  const needle = String(reference || '').trim().toLowerCase();
  if (!needle || needle.indexOf('@') < 1) return [];
  return loadOrders().filter(order =>
    String(order.email || '').trim().toLowerCase() === needle
  );
};

/* The one reference that can legitimately match several orders. */
const looksLikeEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

/* Only what the customer's own tracking page needs. Deliberately does not
   include the full address or phone. */
const publicOrder = order => ({
  id: order.id,
  trackingId: order.trackingId,
  customer: order.customer,
  email: order.email,
  city: order.city,
  status: order.status,
  payment: order.payment,
  date: order.date,
  items: order.items || [],
  shipping: order.shipping || {},
  total: Math.round(Number(order.total) || 0)
});

const nextOrderNumber = orders => {
  const highest = orders.reduce((max, order) => {
    const match = /#SOL-(\d+)/.exec(String(order.id || ''));
    return match ? Math.max(max, Number(match[1])) : max;
  }, 1048);
  return '#SOL-' + (highest + 1);
};

/* Plain hex, long enough that guessing is hopeless. */
const makeTrackingId = () => crypto.randomBytes(16).toString('hex');

const escapeHtml = value => String(value == null ? '' : value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
/* ----------------------------------------------------------------- email */

/* Builds the message the customer receives. Both a plain-text and an HTML
   version are returned so the same content works in a mail client and in any
   inbox that would otherwise strip the HTML part. */
const buildCustomerEmail = (order, req) => {
  const quote = order.shipping || {};
  const total = Number(order.total) || 0;
  /* The whole point of the email: a link they can click from any device. */
  const trackUrl = siteUrl('/track.html?id=' + encodeURIComponent(order.trackingId), req);
  const rows = (order.items || []).map(item =>
    '  - ' + item.name + ' (' + (item.color || 'colour not recorded') +
    (item.size ? ', size ' + item.size : ', size not recorded') + ')' +
    ' x' + item.qty + ' — ' + money(Number(item.price) * Number(item.qty))
  ).join('\n');
  const charge = quote.waived ? 'Free' : money(quote.delivery || 0);

  const lines = [
    'Hello ' + (order.customer || 'there') + ',',
    '',
    'Thank you for shopping with Solids. Your order is confirmed and we are packing it now.',
    '',
    'Order number:  ' + order.id,
    'Tracking ID:   ' + order.trackingId,
    'Placed:        ' + (order.date || ''),
    'Payment:       ' + (order.payment || ''),
    'Delivering to: ' + (order.city || ''),
    '',
    'What you ordered:',
    rows,
    '',
    'Subtotal: ' + money(quote.subtotal || 0),
    (quote.label || 'Delivery charges') + ': ' + charge,
    'Total:    ' + money(total),
    '',
    'Track your parcel any time — the link below works on any device, and you can look it up with your email address too:',
    trackUrl,
    '',
    'Delivery takes 4–7 working days. We will email you again the moment it ships.',
    '',
    'Questions? Just reply to this message.',
    '',
    '— Solids'
  ].join('\n');

  const itemsHtml = (order.items || []).map(item =>
    '<tr><td style="padding:6px 0;font-size:13px;color:#55504a">' +
    escapeHtml(item.name) + ' · ' + escapeHtml(item.color || 'Colour not recorded') +
    (item.size ? ' · size ' + escapeHtml(item.size) : ' · size not recorded') + ' × ' + escapeHtml(item.qty) +
    '</td><td style="padding:6px 0;text-align:right;font-size:13px;color:#292827">' +
    escapeHtml(money(Number(item.price) * Number(item.qty))) + '</td></tr>'
  ).join('');

  const html = [
    '<div style="font-family:Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#292827">',
    '<p style="font-size:11px;letter-spacing:2px;color:#8a8378;margin:0 0 4px">SOLIDS</p>',
    '<h1 style="font-size:22px;margin:0 0 16px">Order confirmed</h1>',
    '<p style="font-size:14px;line-height:1.6">Hello ' + escapeHtml(order.customer || 'there') +
    ', thank you for shopping with Solids. Your order is confirmed and we are packing it now.</p>',
    '<div style="border:1px solid #e6e2db;padding:18px;margin:22px 0">',
    '<p style="margin:0 0 4px;font-size:13px"><strong>Order number:</strong> ' + escapeHtml(order.id) + '</p>',
    '<p style="margin:0 0 4px;font-size:13px"><strong>Tracking ID:</strong> ' + escapeHtml(order.trackingId) + '</p>',
    '<p style="margin:0 0 4px;font-size:13px"><strong>Delivering to:</strong> ' + escapeHtml(order.city || '') + '</p>',
    '<p style="margin:0;font-size:13px"><strong>Payment:</strong> ' + escapeHtml(order.payment || '') + '</p>',
    '</div>',
    '<table style="width:100%;border-collapse:collapse;margin:0 0 12px">' + itemsHtml + '</table>',
    '<p style="font-size:13px;margin:0">Subtotal ' + escapeHtml(money(quote.subtotal || 0)) +
    ' · ' + escapeHtml(quote.label || 'Delivery charges') + ' ' + escapeHtml(charge) + '</p>',
    '<p style="font-size:16px;margin:6px 0 0"><strong>Total ' + escapeHtml(money(total)) + '</strong></p>',
    '<p style="margin:24px 0 0"><a href="' + escapeAttr(trackUrl) +
    '" style="display:inline-block;background:#292827;color:#fff;padding:14px 22px;text-decoration:none;font-size:12px;letter-spacing:1px">TRACK YOUR PARCEL</a></p>',
    '<p style="margin:16px 0 0;font-size:11px;color:#8a8378;line-height:1.6">Or paste this link into any browser:<br>' +
    escapeHtml(trackUrl) + '</p>',
    '<p style="margin:22px 0 0;font-size:11px;color:#8a8378">Delivery takes 4–7 working days. We will email you again the moment it ships.</p>',
    '</div>'
  ].join('');

  return { lines, html, trackUrl, total };
};

const escapeAttr = value => escapeHtml(value).replace(/`/g, '&#96;');

/* A short heads-up for the studio: who ordered, what, how much, and a direct
   link to the order in the admin panel. */
const buildStudioEmail = (order, req) => {
  const quote = order.shipping || {};
  const items = (order.items || []).map(item =>
    item.name + ' (' + (item.color || 'colour not recorded') +
    (item.size ? ', size ' + item.size : ', size not recorded') + ') x' + item.qty
  ).join(', ');
  const lines = [
    'New order from the storefront.',
    '',
    order.id + '  —  ' + (order.customer || ''),
    'Email:  ' + (order.email || ''),
    'Phone:  ' + (order.phone || '—'),
    'City:   ' + (order.city || '—'),
    'Payment:' + ' ' + (order.payment || ''),
    '',
    'Items:  ' + items,
    'Total:  ' + money(Number(order.total) || 0),
    '',
    'Open in the studio dashboard:',
    siteUrl('/orders.html', req)
  ].join('\n');

  const html = [
    '<div style="font-family:Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#292827">',
    '<p style="font-size:11px;letter-spacing:2px;color:#8a8378;margin:0 0 4px">SOLIDS — NEW ORDER</p>',
    '<h1 style="font-size:20px;margin:0 0 16px">' + escapeHtml(order.id) + '</h1>',
    '<p style="font-size:14px;margin:0 0 4px"><strong>' + escapeHtml(order.customer || '') + '</strong> · ' +
    escapeHtml(order.city || '') + '</p>',
    '<p style="font-size:13px;color:#55504a;margin:0 0 4px">' + escapeHtml(order.email || '') +
    (order.phone ? ' · ' + escapeHtml(order.phone) : '') + '</p>',
    '<p style="font-size:13px;color:#55504a;margin:0 0 16px">' + escapeHtml(items) + '</p>',
    '<p style="font-size:16px;margin:0 0 20px"><strong>Total ' + escapeHtml(money(Number(order.total) || 0)) + '</strong></p>',
    '<p style="margin:0"><a href="' + escapeAttr(siteUrl('/orders.html', req)) +
    '" style="display:inline-block;background:#292827;color:#fff;padding:12px 20px;text-decoration:none;font-size:12px;letter-spacing:1px">OPEN DASHBOARD</a></p>',
    '</div>'
  ].join('');

  return { lines, html };
};

/* Sends via the Resend HTTP API. No SDK — one HTTPS POST is enough. Returns
   { sent: false } when no key is configured so callers can fall back quietly. */
const sendMail = async message => {
  if (!RESEND_API_KEY) return { sent: false, reason: 'no-key' };
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + RESEND_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: MAIL_FROM,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html
    })
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error('Resend ' + response.status + ': ' + detail.slice(0, 200));
  }
  return { sent: true, data: await response.json() };
};

/* --------------------------------------------------------------- plumbing */

/* Absolute base for links inside emails — a relative /track.html would break
   the moment the email is opened anywhere but this server.

   SITE_URL wins when set. Otherwise the address the order actually arrived on
   is used, so a deploy with no SITE_URL still produces a working link instead
   of the "localhost" placeholder. The host is whitelisted because it is
   attacker-controlled and these strings end up in an email a stranger reads. */
const baseUrl = req => {
  if (SITE_URL) return SITE_URL;
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim()
    || (req.socket && req.socket.encrypted ? 'https' : 'http');
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  /* Only a plain hostname with an optional port. Anything else is discarded. */
  if (!/^[A-Za-z0-9.-]+(:\d{1,5})?$/.test(host)) return 'http://localhost:' + PORT;
  return proto + '://' + host;
};

const siteUrl = (pathname, req) => baseUrl(req) + pathname;

const json = (res, status, body) => {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(body));
};

/* Accepts a raw image body with the type in a query parameter. Returns the URL
   the catalogue should store. The admin page sends one request per image. */
const IMAGE_TYPES = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif'
};

const handleUpload = async (req, res, url) => {
  if (!requireAdmin(req, res)) return;
  const type = String(new URL(url, 'http://localhost').searchParams.get('type') || '').toLowerCase();
  const extension = IMAGE_TYPES[type];
  if (!extension) {
    return json(res, 400, { ok: false, error: 'Please upload a PNG, JPG, WEBP, GIF or AVIF image.' });
  }
  let buffer;
  try { buffer = await readBinary(req); }
  catch (error) { return json(res, 400, { ok: false, error: error.message }); }
  if (!buffer || !buffer.length) {
    return json(res, 400, { ok: false, error: 'That image file was empty.' });
  }
  try {
    fs.mkdirSync(uploadsDir, { recursive: true });
    const name = Date.now() + '-' + Math.random().toString(36).slice(2, 10) + extension;
    fs.writeFileSync(path.join(uploadsDir, name), buffer);
    return json(res, 200, { ok: true, url: '/uploads/' + name });
  } catch (error) {
    console.error('[upload] save failed:', error.message);
    return json(res, 500, { ok: false, error: 'Could not store the image. Check Railway persistent storage.' });
  }
};

/* Serves a stored product photo. Kept separate from the static handler because
   the files live in the data volume, not in the deployed code. */
const serveUpload = (res, name) => {
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return false;
  const filePath = path.join(uploadsDir, name);
  if (!fs.existsSync(filePath)) return false;
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'public, max-age=31536000, immutable'
  });
  fs.createReadStream(filePath).pipe(res);
  return true;
};

const readBody = (req, limit = 200000) => new Promise((resolve, reject) => {
  let raw = '';
  /* Cap the body so a malformed or hostile request cannot grow unbounded. */
  req.on('data', chunk => {
    raw += chunk;
    if (raw.length > limit) {
      reject(new Error('Payload too large'));
      req.destroy();
    }
  });
  req.on('end', () => {
    if (!raw) return resolve({});
    try { resolve(JSON.parse(raw)); }
    catch (error) { reject(new Error('Invalid JSON body')); }
  });
  req.on('error', reject);
});

/* Same idea, but keeps the raw bytes for an image upload, where JSON.parse
   would corrupt the file. */
const readBinary = (req, limit = 6000000) => new Promise((resolve, reject) => {
  const chunks = [];
  let total = 0;
  req.on('data', chunk => {
    total += chunk.length;
    if (total > limit) {
      reject(new Error('Image is too large. Please pick a smaller file (under 5MB).'));
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on('end', () => resolve(Buffer.concat(chunks)));
  req.on('error', reject);
});

/* The email must never lose the order. The order is already saved by the time
   this runs, so a mail problem is reported, not thrown. */
const mailCustomer = async (order, req) => {
  const mail = buildCustomerEmail(order, req);
  try {
    const result = await sendMail({
      to: order.email,
      subject: 'Your Solids order ' + order.id + ' — track it here',
      text: mail.lines,
      html: mail.html
    });
    return { emailSent: result.sent, trackUrl: mail.trackUrl };
  } catch (error) {
    console.error('[mail] customer email failed for ' + order.id + ':', error.message);
    return { emailSent: false, mailError: error.message, trackUrl: mail.trackUrl };
  }
};

/* A copy to the studio so a new order is visible without opening the panel. */
const mailStudio = async (order, req) => {
  if (!STUDIO_EMAIL) return;
  try {
    const mail = buildStudioEmail(order, req);
    await sendMail({
      to: STUDIO_EMAIL,
      subject: 'New order ' + order.id + ' — ' + order.customer,
      text: mail.lines,
      html: mail.html
    });
  } catch (error) {
    console.error('[mail] studio alert failed for ' + order.id + ':', error.message);
  }
};

/* Minimal brake on the tracking endpoint. The tracking ID is long and random,
   so this only stops a script hammering it — it is not real authentication. */
const attempts = new Map();
const tooManyAttempts = key => {
  const now = Date.now();
  const entry = attempts.get(key) || { count: 0, since: now };
  if (now - entry.since > 60000) { entry.count = 0; entry.since = now; }
  entry.count += 1;
  attempts.set(key, entry);
  return entry.count > 40;
};

/* ------------------------------------------------------------------- API */

/* POST /api/orders — the customer has just paid or confirmed on checkout. */
const handleCreate = async (req, res) => {
  let body;
  try { body = await readBody(req); }
  catch (error) { return json(res, 400, { ok: false, error: error.message }); }

  const customer = String(body.customer || '').trim();
  const email = String(body.email || '').trim();
  const items = Array.isArray(body.items) ? body.items : [];
  /* Only these three are mandatory. Everything else is nice-to-have and the
     storefront already defaults it, so a partial payload still places an order. */
  if (!customer || !email || !items.length) {
    return json(res, 400, { ok: false, error: 'name, email and at least one item are required' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(res, 400, { ok: false, error: 'That email address does not look right.' });
  }

  const orders = loadOrders();
  const total = Number(body.total);
  const order = {
    id: nextOrderNumber(orders),
    trackingId: makeTrackingId(),
    initials: customer.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase(),
    customer,
    email,
    phone: String(body.phone || ''),
    address: String(body.address || ''),
    city: String(body.city || ''),
    date: String(body.date || new Date().toLocaleString('en-PK')),
    items,
    status: 'Pending',
    payment: String(body.payment || 'Cash on delivery'),
    shipping: body.shipping || {},
    total: Number.isFinite(total) ? total : 0
  };

  orders.unshift(order);
  saveOrders(orders);
  try {
    const products = loadProducts();
    if (products) {
      order.items.forEach(item => {
        const product = products.find(candidate => candidate.name === item.name);
        if (!product) return;
        const size = (product.sizes || []).find(candidate => candidate.label === item.size);
        const quantity = Math.max(0, Number(item.qty) || 1);
        if (size) {
          size.stock = Math.max(0, (Number(size.stock) || 0) - quantity);
          size.sold = (Number(size.sold) || 0) + quantity;
          product.sold = (product.sizes || []).reduce((sum, entry) => sum + (Number(entry.sold) || 0), 0);
        } else {
          product.stock = Math.max(0, (Number(product.stock) || 0) - quantity);
          product.sold = (Number(product.sold) || 0) + quantity;
        }
      });
      saveProducts(products);
    }
  } catch (error) {
    console.error('[products] stock update failed for ' + order.id + ':', error.message);
  }

  /* Saved first, emailed second — a mail outage must never lose the order. */
  const mail = await mailCustomer(order, req);
  await mailStudio(order, req);

  return json(res, 201, {
    ok: true,
    order: publicOrder(order),
    emailSent: mail.emailSent,
    mailError: mail.mailError || null,
    trackUrl: mail.trackUrl
  });
};

/* GET /api/orders/:ref — the tracking page. Accepts the tracking ID, the order
   number, or the customer's own email address. */
const handleLookup = (req, res, reference) => {
  const clientKey = req.socket.remoteAddress || 'unknown';
  if (tooManyAttempts(clientKey)) {
    return json(res, 429, { ok: false, error: 'Too many lookups. Try again in a minute.' });
  }
  /* An email returns the customer's whole history so they can pick the parcel
     they actually mean; a tracking ID or order number names exactly one, so
     that still comes back as a single order. */
  if (looksLikeEmail(reference)) {
    const matches = findOrdersByEmail(reference);
    if (!matches.length) return json(res, 404, { ok: false, error: 'not-found' });
    return json(res, 200, {
      ok: true,
      orders: matches.map(publicOrder),
      /* Kept so the caller can treat an email with one order the same way. */
      order: publicOrder(matches[0])
    });
  }

  const order = findOrder(reference);
  if (!order) return json(res, 404, { ok: false, error: 'not-found' });
  return json(res, 200, { ok: true, order: publicOrder(order) });
};

/* PATCH /api/orders/:ref — the studio marks an order shipped or delivered,
   which is what makes the customer's tracking page move along. */
const handleUpdate = async (req, res, reference) => {
  let body;
  try { body = await readBody(req); }
  catch (error) { return json(res, 400, { ok: false, error: error.message }); }

  /* Closed unless ADMIN_KEY is set, so nobody can mark orders delivered from
     a random browser over the open internet. */
  const expected = process.env.ADMIN_KEY || '';
  const given = String(req.headers['x-admin-key'] || '');
  if (!expected || given !== expected) {
    return json(res, 401, { ok: false, error: 'Not authorised' });
  }

  /* Must stay in step with ORDER_STATUSES in admin-pages.js, otherwise the
     studio picks a status in the panel and the server rejects it. */
  const allowed = ['Pending', 'Paid', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];
  const status = String(body.status || '');
  if (allowed.indexOf(status) === -1) {
    return json(res, 400, { ok: false, error: 'Unknown status' });
  }

  const orders = loadOrders();
  const needle = String(reference).trim().toLowerCase().replace(/^#/, '');
  const index = orders.findIndex(order =>
    String(order.trackingId || '').toLowerCase() === String(reference).toLowerCase() ||
    String(order.id || '').toLowerCase().replace(/^#/, '') === needle);
  if (index === -1) return json(res, 404, { ok: false, error: 'not-found' });

  orders[index].status = status;
  saveOrders(orders);
  return json(res, 200, { ok: true, order: publicOrder(orders[index]) });
};

/* ------------------------------------------------------- static file serving */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

/* Resolves a request path to a real file inside the project, or null. The
   resolved path is checked against the root so "../" cannot escape it. */
const resolveFile = pathname => {
  const decoded = decodeURIComponent(pathname.split('?')[0]);
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const filePath = path.resolve(root, relative);
  /* path.resolve already collapses "..", so this catches anything that still
     points outside the project. */
  if (filePath !== root && !filePath.startsWith(root + path.sep)) return null;
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    const index = path.join(filePath, 'index.html');
    return fs.existsSync(index) ? index : null;
  }
  return fs.existsSync(filePath) ? filePath : null;
};

const serveFile = (res, filePath) => {
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-cache'
  });
  fs.createReadStream(filePath).pipe(res);
};

/* -------------------------------------------------------------------- boot */

const server = http.createServer(async (req, res) => {
  const url = req.url || '/';
  const method = req.method || 'GET';

  /* API routes first — they never fall through to the filesystem. */
  if (url.startsWith('/api/')) {
    const orderMatch = /^\/api\/orders\/([^/?#]+)/.exec(url);

    /* Cheap liveness check for the hosting platform, and it confirms the
       orders file is actually writable — which is the one thing that silently
       breaks on a host with a read-only filesystem. */
    if (url === '/api/health') {
      let writable = true;
      try {
        fs.mkdirSync(dataDir, { recursive: true });
        fs.accessSync(dataDir, fs.constants.W_OK);
      } catch (error) {
        writable = false;
      }
      return json(res, 200, {
        ok: true,
        orders: loadOrders().length,
        dataWritable: writable,
        mail: RESEND_API_KEY ? 'on' : 'off'
      });
    }

    if (url === '/api/config' && method === 'GET') {
      /* Tells the admin page which setup steps are still missing, so it can say
         "ADMIN_KEY is not set on Railway" instead of the browser's bare
         JavaScript prompt that gave no clue what had gone wrong. */
      return json(res, 200, {
        ok: true,
        adminEditing: Boolean(process.env.ADMIN_KEY),
        cloudinary: {
          cloudName: CLOUDINARY_CLOUD_NAME,
          configured: Boolean(CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET)
        }
      });
    }

    if (url === '/api/cloudinary-signature' && method === 'POST') {
      if (!requireAdmin(req, res)) return;
      if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
        return json(res, 503, { ok: false, error: 'Set all CLOUDINARY_* variables in Railway before uploading images.' });
      }
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = crypto.createHash('sha1')
        .update('folder=products&timestamp=' + timestamp + CLOUDINARY_API_SECRET)
        .digest('hex');
      return json(res, 200, {
        ok: true,
        cloudName: CLOUDINARY_CLOUD_NAME,
        apiKey: CLOUDINARY_API_KEY,
        folder: 'products',
        timestamp,
        signature
      });
    }

    /* The admin page's own image upload. Needs no third-party account, so a fresh
       deploy can add products immediately. */
    if (url.startsWith('/api/upload') && method === 'POST') {
      return handleUpload(req, res, url);
    }

    if (new URL(url, 'http://localhost').pathname === '/api/products' && method === 'GET') {
      const adminView = new URL(url, 'http://localhost').searchParams.get('admin') === '1';
      if (adminView && !requireAdmin(req, res)) return;
      try {
        const products = loadProducts();
        return json(res, 200, {
          ok: true,
          configured: products !== null,
          products: adminView ? products : publicProducts(products)
        });
      } catch (error) {
        console.error('[products] read failed:', error.message);
        return json(res, 500, { ok: false, error: 'Could not read saved product catalogue.' });
      }
    }

    if (url === '/api/products' && (method === 'POST' || method === 'PUT')) {
      if (!requireAdmin(req, res)) return;
      let body;
      try { body = await readBody(req, 2500000); }
      catch (error) { return json(res, 400, { ok: false, error: error.message }); }
      if (!Array.isArray(body.products) || body.products.length > 500) {
        return json(res, 400, { ok: false, error: 'Product catalogue must be an array of at most 500 products.' });
      }
      const encoded = JSON.stringify(body.products);
      if (Buffer.byteLength(encoded, 'utf8') > 2000000 || /"data:image\//i.test(encoded)) {
        return json(res, 413, { ok: false, error: 'Product images must be uploaded to the server before saving.' });
      }
      if (body.products.some(product =>
        !product || typeof product.name !== 'string' || !product.name.trim() ||
        typeof product.image !== 'string' || !product.image.trim()
      )) {
        return json(res, 400, { ok: false, error: 'Every product needs a name and an image URL.' });
      }
      try {
        const existing = loadProducts();
        if (method === 'POST' && existing !== null) {
          return json(res, 409, { ok: false, error: 'The product catalogue has already been initialized.' });
        }
        if (method === 'PUT' && existing === null) {
          return json(res, 409, { ok: false, error: 'Initialize the product catalogue before updating it.' });
        }
        saveProducts(body.products);
        return json(res, 200, { ok: true, count: body.products.length });
      } catch (error) {
        console.error('[products] save failed:', error.message);
        return json(res, 500, { ok: false, error: 'Could not save product catalogue. Check Railway persistent storage.' });
      }
    }

    if (url === '/api/orders' && method === 'POST') {
      return handleCreate(req, res);
    }
    if (orderMatch && method === 'GET') {
      return handleLookup(req, res, decodeURIComponent(orderMatch[1]));
    }
    if (orderMatch && method === 'PATCH') {
      return handleUpdate(req, res, decodeURIComponent(orderMatch[1]));
    }
    return json(res, 404, { ok: false, error: 'Unknown endpoint' });
  }

  if (method !== 'GET' && method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end();
  }

  /* Stored product photos. These live on the data volume rather than in the
     deployed code, so they need their own route. */
  if (url.startsWith('/uploads/')) {
    const name = decodeURIComponent(url.slice('/uploads/'.length).split('?')[0]);
    if (serveUpload(res, name)) return;
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Image not found');
  }

  const filePath = resolveFile(url);
  if (!filePath) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Not found');
  }
  return serveFile(res, filePath);
});

server.listen(PORT, () => {
  console.log('Solids storefront at http://localhost:' + PORT);
  if (RESEND_API_KEY) {
    console.log('  emails: on (Resend, sending as ' + MAIL_FROM + ')');
  } else {
    console.log('  emails: OFF - set RESEND_API_KEY in .env to send tracking links.');
  }
  if (!process.env.ADMIN_KEY) {
    console.log('  admin status updates: locked (set ADMIN_KEY in .env to unlock)');
  }
  if (!SITE_URL) {
    console.log('  SITE_URL not set - links in email use localhost.');
  }
});