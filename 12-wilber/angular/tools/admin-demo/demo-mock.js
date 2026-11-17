/*
 * Wilber ADMIN DEMO — runs the real admin build with SAMPLE data, entirely in the browser.
 * Loaded by index.html BEFORE the Angular bundle (only in the demo copy; never in the production build).
 *  - Signs in a fake "Demo Staff" user (localStorage glint.session).
 *  - Answers every call to the Glint API (XHR from Angular HttpClient + fetch for uploads) from in-memory data.
 *  - Products / categories / banners come from the LIVE published catalogue (read-only CDN); orders, customers,
 *    COD collections etc. are invented. Changes last until the page is reloaded. Nothing reaches the real API.
 */
(function () {
  'use strict';
  var API = 'https://8zjj9tidxa.execute-api.ap-south-1.amazonaws.com';
  var CDN = 'https://dgc9s3tjkcr84.cloudfront.net';
  var TENANT = 'wilber-stage';
  var UPLOAD_HOST = 'https://demo-upload.invalid';
  var realFetch = window.fetch.bind(window);

  // ---------- fake signed-in staff ----------
  var PERMS = ['dashboard', 'products', 'categories', 'orders', 'stock_management', 'customers', 'blogs', 'recommendations', 'settings',
    'manage_users', 'content_management', 'access_control', 'quotes', 'reports', 'audit', 'pricing', 'discounts', 'tax_information'];
  var USER = { id: 'u1', phone: '9876543210', name: 'Demo Staff', email: 'demo@example.com', role: 'SUPER_ADMIN', permissions: PERMS, status: 'ACTIVE' };
  function session() { return { token: 'demo', refreshToken: 'demo', expiresAt: Math.floor(Date.now() / 1000) + 30 * 86400, user: USER }; }
  if (!localStorage.getItem('glint.session')) localStorage.setItem('glint.session', JSON.stringify(session()));

  // ---------- demo banner ----------
  document.addEventListener('DOMContentLoaded', function () {
    var b = document.createElement('div');
    b.id = 'demo-ribbon';
    b.textContent = 'DEMO — sample data, nothing is saved. Reload the page to reset.';
    // phones: just above the footer tabs; desktop: bottom-left corner over the menu (clear of the search box and Save buttons)
    b.style.cssText = 'position:fixed;' + (innerWidth >= 768 ? 'left:16px;bottom:12px;' : 'left:50%;transform:translateX(-50%);bottom:72px;') + 'z-index:99999;background:#fff3cd;color:#664d03;' +
      'border:1px solid #ffda6a;border-radius:20px;padding:4px 14px;font:600 12px system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.15);' +
      'pointer-events:none;white-space:nowrap;opacity:.95';
    document.body.appendChild(b);
  });

  // ---------- data ----------
  var now = Date.now();
  var iso = function (ms) { return new Date(ms).toISOString(); };
  var db = { products: [], categories: [], banners: [], orders: [], customers: [], collections: [], users: [], settings: {}, blogs: [], published: iso(now - 3600e3) };
  var details = {};   // slug -> published product JSON (loaded on demand)
  var catalogBase = null;
  var stockOf = function (i, j) { return [24, 3, 0, 57, 12, 5, 80, 1][(i + j) % 8]; };

  var ready = realFetch(CDN + '/catalog/' + TENANT + '/latest.json?t=' + Math.floor(now / 60000))
    .then(function (r) { return r.json(); })
    .then(function (ptr) {
      catalogBase = ptr.base.replace(/\/?$/, '/');
      return Promise.all([
        realFetch(catalogBase + 'products.json').then(function (r) { return r.json(); }),
        realFetch(catalogBase + 'categories.json').then(function (r) { return r.json(); }),
        realFetch(catalogBase + 'banners.json').then(function (r) { return r.ok ? r.json() : { banners: [] }; }).catch(function () { return { banners: [] }; })
      ]);
    })
    .then(function (all) {
      var cards = all[0].products || [];
      db.categories = (all[1].categories || []).map(function (c) { return Object.assign({ active: true }, c); });
      db.products = cards.map(function (c, i) {
        return Object.assign({}, c, {
          active: i % 13 !== 5, stockManaged: true, images: c.thumbnail ? [c.thumbnail] : [],
          specs: [], features: [], applications: [], considerations: [], howToApply: [],
          variants: (c.variants || []).map(function (v, j) { return Object.assign({}, v, { active: true, stock: stockOf(i, j), sku: (c.code || 'W') + '-' + (j + 1) }); })
        });
      });
      var pub = (all[2].banners || []);
      db.banners = pub.length ? pub : [
        { id: 'b1', title: 'Durability That Lasts', placement: 'home-hero', imageDesktop: 'https://wilber.cloudshops.app/assets/images/banner1.png', linkType: 'none', sortOrder: 1, active: true },
        { id: 'b2', title: 'Seamless Application', placement: 'home-hero', imageDesktop: 'https://wilber.cloudshops.app/assets/images/banner2.png', linkType: 'none', sortOrder: 2, active: true },
        { id: 'b3', title: 'High-Strength Adhesion', placement: 'home-hero', imageDesktop: 'https://wilber.cloudshops.app/assets/images/banner3.png', linkType: 'none', sortOrder: 3, active: false }];
      buildSampleData();
    })
    .catch(function (e) { console.error('[demo] catalogue load failed', e); buildSampleData(); });

  function buildSampleData() {
    var names = [['Ramesh Kumar', 'Bengaluru'], ['Anita Shah', 'Mumbai'], ['S. Prakash', 'Chennai'], ['Meera Nair', 'Kochi'], ['Vikram Rao', 'Hyderabad'], ['Fatima Khan', 'Pune']];
    var statuses = ['PLACED', 'CONFIRMED', 'READY_TO_DISPATCH', 'DISPATCHED', 'DELIVERED', 'PLACED', 'CANCELLED', 'DELIVERED'];
    var phone = function (i) { return '98450' + String(10000 + i * 37).slice(-5); };
    db.customers = names.map(function (n, i) {
      return { id: 'c' + i, name: n[0], phone: phone(i), email: i % 2 ? '' : n[0].split(' ')[0].toLowerCase() + '@example.com', role: 'CUSTOMER',
        status: i === 4 ? 'BLOCKED' : 'ACTIVE', createdAt: iso(now - i * 9e8) };
    });
    var P = db.products.length ? db.products : [{ id: 'p0', name: 'Sample product', variants: [{ id: 'v0', name: '1 kg', pricePaise: 50000 }] }];
    db.orders = [];
    for (var i = 0; i < 14; i++) {
      var n = names[i % names.length], p = P[(i * 7) % P.length], v = p.variants[0], qty = 1 + (i % 4), sub = v.pricePaise * qty;
      var st = statuses[i % statuses.length], cod = i % 2 === 1, ship = i % 3 ? 0 : 15000, created = now - i * 5.3 * 3600e3;
      var addr = { name: n[0], phone: phone(i % names.length), line1: (12 + i) + ', 3rd Cross, Industrial Area', city: n[1], state: 'Karnataka', pincode: '5600' + (10 + i) };
      var o = {
        id: 'WI' + (24110 + i), userId: 'c' + (i % names.length), customer: { name: n[0], phone: addr.phone }, shippingAddress: addr,
        lines: [line(p, v, qty)], subtotalPaise: sub, discountPaise: 0, shippingPaise: ship, codFeePaise: 0, taxPaise: Math.round(sub * 18 / 118),
        cgstPaise: 0, sgstPaise: 0, igstPaise: 0, pricesIncludeTax: true, totalPaise: sub + ship, paymentMethod: cod ? 'cod' : 'offline',
        paymentStatus: cod ? (st === 'DELIVERED' ? 'COD_COLLECTED' : 'COD_PENDING') : 'PAID', status: st, channel: i % 3 ? 'WEB' : 'ADMIN',
        createdAt: iso(created), updatedAt: iso(created),
        history: [{ at: iso(created), status: 'PLACED' }].concat(st !== 'PLACED' ? [{ at: iso(created + 3 * 3600e3), status: st, by: 'Demo Staff' }] : [])
      };
      if (st === 'DISPATCHED' || st === 'DELIVERED') o.shipment = { courier: 'DTDC', awb: 'D' + (7700120 + i), trackingUrl: '' };
      db.orders.push(o);
    }
    // a couple of delivered COD orders with collections, and some outstanding
    db.orders.forEach(function (o, k) {
      if (o.paymentMethod === 'cod' && o.status === 'DELIVERED') {
        db.collections.push({ id: 'col' + k, key: 'col' + k, orderId: o.id, amountPaise: o.totalPaise, date: o.createdAt.slice(0, 10),
          mode: k % 2 ? 'upi' : 'cash', reference: k % 2 ? 'UPI/4412' + k : '', collectedBy: 'Ravi (delivery)', note: 'Collected on delivery',
          recordedBy: 'Demo Staff', createdAt: iso(Date.parse(o.createdAt) + 6 * 3600e3), customerName: o.customer.name, customerPhone: o.customer.phone });
      }
    });
    var partial = db.orders.find(function (o) { return o.paymentMethod === 'cod' && o.status === 'DISPATCHED'; });
    if (partial) {
      partial.status = 'DELIVERED'; partial.paymentStatus = 'COD_PARTIAL';
      db.collections.push({ id: 'colp', key: 'colp', orderId: partial.id, amountPaise: Math.round(partial.totalPaise / 2), date: iso(now - 86400e3).slice(0, 10),
        mode: 'cash', collectedBy: 'Ravi (delivery)', note: 'Customer paid half, balance next week', recordedBy: 'Demo Staff', createdAt: iso(now - 86400e3),
        customerName: partial.customer.name, customerPhone: partial.customer.phone });
    }
    db.users = [USER, { id: 'u2', phone: '9900112233', name: 'Ravi (store)', role: 'STORE_MANAGER', permissions: [], status: 'ACTIVE' }];
    db.settings = {
      store: { name: 'Wilber Impex', email: 'support@wilber.co.in', phone: '9876543210', gstin: '29AAAAA0000A1Z5' },
      shipping: { provider: 'none', pickupLocation: 'Primary', flatFeePaise: 15000, freeAbovePaise: 500000 },
      payments: { cod: true, offline: true }, invoicing: { invoicePrefix: 'WI' }
    };
    db.blogs = [{ slug: 'choosing-tile-adhesive', title: 'Choosing the right tile adhesive', excerpt: 'Sample blog post for the demo.', published: true, createdAt: iso(now - 20 * 86400e3) }];
  }

  function line(p, v, qty) {
    return { productId: p.id, variantId: v.id, slug: p.slug, name: p.name, variantName: v.name, sku: v.sku, image: p.thumbnail,
      unitPricePaise: v.pricePaise, mrpPaise: v.mrpPaise || 0, qty: qty, lineTotalPaise: v.pricePaise * qty, taxRatePercent: 18,
      taxPaise: Math.round(v.pricePaise * qty * 18 / 118), available: true };
  }
  function findProduct(id) { return db.products.find(function (p) { return p.id === id || p.slug === id; }); }
  function findOrder(id) { return db.orders.find(function (o) { return o.id === id; }); }
  function quoteFor(body) {
    var lines = (body.items || []).map(function (it) {
      var p = findProduct(it.productId); if (!p) return null;
      var v = p.variants.find(function (x) { return x.id === it.variantId; }) || p.variants[0];
      return line(p, v, it.qty || 1);
    }).filter(Boolean);
    var sub = lines.reduce(function (s, l) { return s + l.lineTotalPaise; }, 0);
    var ship = sub >= 500000 || !sub ? 0 : 15000;
    return { lines: lines, subtotalPaise: sub, discountPaise: 0, shippingPaise: ship, codFeePaise: 0, taxPaise: Math.round(sub * 18 / 118),
      cgstPaise: 0, sgstPaise: 0, igstPaise: 0, pricesIncludeTax: true, totalPaise: sub + ship,
      paymentMethods: [{ id: 'cod', label: 'Cash on delivery' }, { id: 'offline', label: 'Paid (offline)' }], issues: [], canCheckout: lines.length > 0 };
  }
  function collectionsOf(o) {
    var items = db.collections.filter(function (c) { return c.orderId === o.id; });
    var got = items.filter(function (c) { return !c.voided; }).reduce(function (s, c) { return s + c.amountPaise; }, 0);
    return { orderId: o.id, totalPaise: o.totalPaise, collectedPaise: got, outstandingPaise: Math.max(0, o.totalPaise - got), paymentStatus: o.paymentStatus, items: items };
  }

  // ---------- router ----------
  var uploads = {};   // publicUrl -> object URL of the uploaded file
  function route(method, path, q, body) {
    var m;
    // auth (login page in the demo accepts any phone + OTP)
    if (path === '/v1/auth/otp/request') return { sent: true, devCode: '123456' };
    if (path === '/v1/auth/otp/verify' || path === '/v1/auth/refresh') return session();
    if (path === '/v1/auth/logout') return {};
    if (path === '/v1/config') return { store: { name: 'Wilber Impex' }, tenant: TENANT, cdnUrl: CDN };
    if (path === '/v1/me' || path === '/v1/admin/me') return USER;
    if (path === '/v1/me/profile') return method === 'GET' ? Object.assign({ staff: true, superAdmin: true, phoneEditable: false }, USER) : Object.assign(USER, body);

    // dashboard
    if (path === '/v1/admin/dashboard') {
      var by = {}; db.orders.forEach(function (o) { by[o.status] = (by[o.status] || 0) + 1; });
      var low = []; db.products.forEach(function (p) { p.variants.forEach(function (v) { if (v.stock <= 5) low.push({ productId: p.id, name: p.name, variantId: v.id, variantName: v.name, qty: v.stock }); }); });
      var tot = function (a) { return a.reduce(function (s, o) { return s + o.totalPaise; }, 0); };
      return { ordersByStatus: by, revenue30dPaise: tot(db.orders), orders30d: db.orders.length, revenueTodayPaise: tot(db.orders.slice(0, 4)), ordersToday: 4,
        dailyRevenuePaise: Array.from({ length: 14 }, function (_, i) { return { date: iso(now - (13 - i) * 86400e3).slice(0, 10), revenuePaise: 150000 + ((i * 7919) % 9) * 60000 }; }),
        customers: db.customers.length, products: db.products.length, activeProducts: db.products.filter(function (p) { return p.active; }).length, lowStock: low.slice(0, 12),
        recentOrders: db.orders.slice(0, 5).map(function (o) { return { id: o.id, customer: o.customer.name, phone: o.customer.phone, totalPaise: o.totalPaise, status: o.status, items: o.lines.length, createdAt: o.createdAt }; }) };
    }

    // confirmations
    var pending = function () { return db.orders.filter(function (o) { return o.status === 'PLACED'; }); };
    if (path === '/v1/admin/confirmations/count') return { count: pending().length };
    if (path === '/v1/admin/confirmations') return { count: pending().length, items: pending().map(function (o) {
      return { id: o.id, createdAt: o.createdAt, ageMinutes: Math.round((now - Date.parse(o.createdAt)) / 60000) + 25, customerName: o.customer.name, customerPhone: o.customer.phone,
        city: o.shippingAddress.city, state: o.shippingAddress.state, paymentMethod: o.paymentMethod, paymentStatus: o.paymentStatus, totalPaise: o.totalPaise, channel: o.channel,
        items: o.lines.map(function (l) { return { name: l.name, variantName: l.variantName, qty: l.qty, lineTotalPaise: l.lineTotalPaise }; }) }; }) };
    if (path === '/v1/admin/confirmations/confirm') {
      var ids = body.orderIds || []; ids.forEach(function (id) { setStatus(findOrder(id), 'CONFIRMED', body.note); });
      return { confirmed: ids.length, failed: 0, results: ids.map(function (id) { return { id: id, ok: true }; }) };
    }
    if ((m = path.match(/^\/v1\/admin\/confirmations\/([^/]+)\/cancel$/))) return setStatus(findOrder(decodeURIComponent(m[1])), 'CANCELLED', body.reason);

    // orders
    if (path === '/v1/admin/orders') {
      var st = q.get('status'), qq = (q.get('q') || '').toLowerCase();
      return { items: db.orders.filter(function (o) { return (!st || o.status === st) && (!qq || JSON.stringify([o.id, o.customer]).toLowerCase().indexOf(qq) >= 0); }), nextCursor: null };
    }
    if ((m = path.match(/^\/v1\/admin\/orders\/([^/]+)\/status$/))) return setStatus(findOrder(decodeURIComponent(m[1])), body.status, body.note, body);
    if ((m = path.match(/^\/v1\/admin\/orders\/([^/]+)\/collections$/))) {
      var oc = findOrder(decodeURIComponent(m[1]));
      if (method === 'GET') return collectionsOf(oc);
      var c = Object.assign({ id: 'col' + Date.now(), key: 'col' + Date.now(), orderId: oc.id, recordedBy: 'Demo Staff', createdAt: iso(Date.now()),
        customerName: oc.customer.name, customerPhone: oc.customer.phone, date: iso(Date.now()).slice(0, 10) }, body);
      db.collections.unshift(c);
      var sum = collectionsOf(oc); oc.paymentStatus = sum.outstandingPaise ? 'COD_PARTIAL' : 'COD_COLLECTED';
      return { collection: c, order: oc };
    }
    if ((m = path.match(/^\/v1\/admin\/orders\/([^/]+)\/invoice$/))) { var oi = findOrder(decodeURIComponent(m[1])); return invoiceView(oi); }
    if ((m = path.match(/^\/v1\/admin\/orders\/([^/]+)\/tracking$/))) return { events: [] };
    if ((m = path.match(/^\/v1\/admin\/orders\/([^/]+)\/refunded$/))) { var orf = findOrder(decodeURIComponent(m[1])); orf.paymentStatus = 'REFUNDED'; return orf; }
    if ((m = path.match(/^\/v1\/admin\/orders\/([^/]+)$/))) return findOrder(decodeURIComponent(m[1])) || db.orders[0];

    // COD collections
    if (path === '/v1/admin/collections/outstanding') {
      var out = db.orders.filter(function (o) { return o.paymentMethod === 'cod' && o.status !== 'CANCELLED' && o.status !== 'PLACED'; })
        .map(function (o) { var s = collectionsOf(o); return { o: o, s: s }; }).filter(function (x) { return x.s.outstandingPaise > 0; })
        .map(function (x) { var o = x.o; return { orderId: o.id, customerName: o.customer.name, customerPhone: o.customer.phone, city: o.shippingAddress.city,
          totalPaise: o.totalPaise, collectedPaise: x.s.collectedPaise, outstandingPaise: x.s.outstandingPaise, paymentStatus: o.paymentStatus, orderDate: o.createdAt,
          deliveredAt: o.status === 'DELIVERED' ? o.updatedAt : undefined, courier: o.shipment && o.shipment.courier, awb: o.shipment && o.shipment.awb,
          ageDays: Math.round((now - Date.parse(o.createdAt)) / 86400e3) }; });
      return { items: out, count: out.length, outstandingPaise: out.reduce(function (s, x) { return s + x.outstandingPaise; }, 0) };
    }
    if (path === '/v1/admin/collections') {
      var live = db.collections.filter(function (c) { return !c.voided; }), byMode = {};
      live.forEach(function (c) { byMode[c.mode] = (byMode[c.mode] || 0) + c.amountPaise; });
      return { items: db.collections, collectedPaise: live.reduce(function (s, c) { return s + c.amountPaise; }, 0), byMode: byMode };
    }
    if ((m = path.match(/^\/v1\/admin\/collections\/([^/]+)\/void$/))) { var cv = db.collections.find(function (c) { return c.key === decodeURIComponent(m[1]); }); if (cv) { cv.voided = true; cv.voidReason = body.reason; } return cv; }

    // products & stock
    if (path === '/v1/admin/products/export') return { rows: [] };
    if (path === '/v1/admin/products') {
      if (method === 'POST') { var np = Object.assign({ id: 'p' + Date.now(), slug: slugify(body.name || 'new-product'), active: true, variants: [] }, body); db.products.unshift(np); return np; }
      var pq = (q.get('q') || '').toLowerCase();
      var items = db.products.filter(function (p) { return !pq || (p.name + ' ' + (p.code || '')).toLowerCase().indexOf(pq) >= 0; });
      return { items: items, page: 0, size: 500, total: items.length };
    }
    if ((m = path.match(/^\/v1\/admin\/products\/([^/]+)\/status$/))) { var ps = findProduct(m[1]); if (ps) ps.active = body.active; return ps; }
    if ((m = path.match(/^\/v1\/admin\/products\/([^/]+)\/recommendations$/))) { var pr = findProduct(m[1]); Object.assign(pr, body); return pr; }
    if ((m = path.match(/^\/v1\/admin\/products\/([^/]+)\/reviews/))) return { items: [], nextCursor: null };
    if ((m = path.match(/^\/v1\/admin\/products\/([^/]+)$/))) {
      var pd = findProduct(decodeURIComponent(m[1]));
      if (method === 'DELETE') { db.products = db.products.filter(function (p) { return p !== pd; }); return {}; }
      if (method === 'PUT') { Object.assign(pd, body); return pd; }
      return productDetail(pd);   // may be a Promise (loads the published detail once)
    }
    if (path === '/v1/admin/stock') {
      var rows = []; db.products.forEach(function (p) { p.variants.forEach(function (v) { rows.push({ productId: p.id, name: p.name, variantId: v.id, variantName: v.name, sku: v.sku, qty: v.stock, thumbnail: p.thumbnail }); }); });
      return { items: rows };
    }
    if ((m = path.match(/^\/v1\/admin\/stock\/([^/]+)$/))) {
      var vid = decodeURIComponent(m[1]), nq = 0;
      db.products.forEach(function (p) { p.variants.forEach(function (v) { if (v.id === vid) { v.stock = body.qty != null ? body.qty : (v.stock || 0) + (body.delta || 0); nq = v.stock; } }); });
      return { variantId: vid, qty: nq };
    }
    if (path === '/v1/admin/catalog-picker') {
      var cq = (q.get('q') || '').toLowerCase();
      return { products: db.products.filter(function (p) { return !cq || p.name.toLowerCase().indexOf(cq) >= 0; }).map(function (p) {
        return { productId: p.id, name: p.name, code: p.code, thumbnail: p.thumbnail, stockManaged: true,
          variants: p.variants.map(function (v) { return { variantId: v.id, name: v.name, sku: v.sku, pricePaise: v.pricePaise, mrpPaise: v.mrpPaise, stock: v.stock }; }) }; }) };
    }

    // categories
    if (path === '/v1/admin/categories') {
      if (method === 'POST') { var nc = Object.assign({ id: 'cat' + Date.now(), slug: slugify(body.name || 'new'), active: true }, body); db.categories.push(nc); return nc; }
      return { categories: db.categories };
    }
    if ((m = path.match(/^\/v1\/admin\/categories\/([^/]+)$/))) {
      var cid = decodeURIComponent(m[1]), cat = db.categories.find(function (c) { return c.id === cid; });
      if (method === 'DELETE') { db.categories = db.categories.filter(function (c) { return c !== cat; }); return {}; }
      Object.assign(cat, body); return cat;
    }

    // customers & staff orders
    if (path === '/v1/admin/customers') return { items: db.customers, nextCursor: null };
    if ((m = path.match(/^\/v1\/admin\/customers\/([^/]+)$/))) {
      var cu = db.customers.find(function (c) { return c.id === m[1]; }) || db.customers[0];
      return Object.assign({}, cu, { addresses: [db.orders.find(function (o) { return o.userId === cu.id; }).shippingAddress],
        orders: db.orders.filter(function (o) { return o.userId === cu.id; }) });
    }
    if (path === '/v1/admin/staff-orders/customer') {
      var ph = q.get('phone'), known = db.customers.find(function (c) { return c.phone === ph; });
      if (!known) return { phone: ph, found: false, addresses: [] };
      var ko = db.orders.find(function (o) { return o.userId === known.id; });
      return { phone: ph, found: true, user: { id: known.id, name: known.name, email: known.email, phone: ph }, addresses: ko ? [Object.assign({ id: 'a-' + known.id, isDefault: true }, ko.shippingAddress)] : [] };
    }
    if (path === '/v1/admin/staff-orders/quote') return quoteFor(body);
    if (path === '/v1/admin/staff-orders') {
      var qt = quoteFor(body), cust = body.customer || {};
      var no = Object.assign({}, qt, { id: 'WI' + (24200 + db.orders.length), userId: 'c-new', customer: { name: cust.name || 'Walk-in customer', phone: cust.phone },
        shippingAddress: Object.assign({ name: cust.name, phone: cust.phone, line1: '', city: '', state: 'Karnataka', pincode: '' }, body.address || {}),
        paymentMethod: (body.payment || {}).method || 'cod', paymentStatus: (body.payment || {}).method === 'offline' ? 'PAID' : 'COD_PENDING',
        status: 'CONFIRMED', channel: 'ADMIN', notes: body.notes, createdAt: iso(Date.now()), updatedAt: iso(Date.now()),
        history: [{ at: iso(Date.now()), status: 'CONFIRMED', by: 'Demo Staff' }] });
      db.orders.unshift(no); return no;
    }

    // invoices & reports
    if (path === '/v1/admin/invoices') {
      var inv = db.orders.filter(function (o) { return o.status !== 'PLACED' && o.status !== 'CANCELLED'; }).map(function (o, k) {
        return { invoiceNo: 'WI/26-27/' + String(101 + k).padStart(4, '0'), orderId: o.id, date: o.createdAt.slice(0, 10), customerName: o.customer.name,
          customerPhone: o.customer.phone, taxablePaise: o.totalPaise - o.taxPaise, taxPaise: o.taxPaise, totalPaise: o.totalPaise, status: 'ISSUED', paymentMethod: o.paymentMethod }; });
      var sumOf = function (k) { return inv.reduce(function (s, x) { return s + x[k]; }, 0); };
      return { from: q.get('from'), to: q.get('to'), items: inv, totals: { count: inv.length, taxablePaise: sumOf('taxablePaise'), taxPaise: sumOf('taxPaise'), totalPaise: sumOf('totalPaise') } };
    }
    if (path === '/v1/admin/reports/sales') return { totals: { totalPaise: 2914000, netPaise: 2469500, taxPaise: 444500, orders: 14, codPaise: 1460000, codOrders: 7, onlinePaise: 0,
      offlinePaise: 1454000, onlineOrders: 0, offlineOrders: 7, cancelledOrders: 1, returnedOrders: 0 },
      rows: Array.from({ length: 7 }, function (_, i) { return { period: iso(now - (6 - i) * 86400e3).slice(0, 10), orders: 1 + (i % 3), totalPaise: 250000 + i * 80000, netPaise: 210000 + i * 68000, taxPaise: 40000 + i * 12000 }; }) };
    if (path === '/v1/admin/reports/products') return { rows: db.products.slice(0, 8).map(function (p, i) { return { name: p.name, variantName: p.variants[0] && p.variants[0].name, qty: 12 - i, totalPaise: (p.variants[0] ? p.variants[0].pricePaise : 0) * (12 - i) }; }) };
    if (path === '/v1/admin/reports/categories') return { rows: db.categories.slice(0, 6).map(function (c, i) { return { name: c.name, qty: 20 - i * 2, totalPaise: 600000 - i * 70000 }; }) };
    if (path === '/v1/admin/reports/gst') return { rows: [], totals: {} };

    // marketing & content
    if (path === '/v1/admin/banners') {
      if (method === 'POST') { var nb = Object.assign({ id: 'b' + Date.now(), createdAt: iso(Date.now()) }, body); db.banners.push(nb); return nb; }
      return { now: iso(Date.now()), placements: ['home-hero', 'home-strip', 'category-top'], banners: db.banners };
    }
    if ((m = path.match(/^\/v1\/admin\/banners\/([^/]+)$/))) {
      var bid = decodeURIComponent(m[1]), bn = db.banners.find(function (b) { return b.id === bid; });
      if (method === 'DELETE') { db.banners = db.banners.filter(function (b) { return b !== bn; }); return {}; }
      Object.assign(bn, body); return bn;
    }
    if (path === '/v1/admin/blogs') { if (method === 'POST') { db.blogs.unshift(body); return body; } return { blogs: db.blogs }; }
    if ((m = path.match(/^\/v1\/admin\/blogs\/([^/]+)$/))) {
      var bs = decodeURIComponent(m[1]);
      if (method === 'DELETE') { db.blogs = db.blogs.filter(function (b) { return b.slug !== bs; }); return {}; }
      var bl = db.blogs.find(function (b) { return b.slug === bs; }); Object.assign(bl, body); return bl;
    }
    if (path === '/v1/admin/publish') {
      if (method === 'POST') db.published = iso(Date.now());
      return { publishedAt: db.published, productCount: db.products.length, bannerCount: db.banners.filter(function (b) { return b.active; }).length, seo: { pages: 69, issues: 95 } };
    }
    if (path === '/v1/admin/seo/report') return { pages: 69, issues: [] };
    if (path === '/v1/admin/media/upload-url') {
      var key = 'demo/' + Date.now() + '-' + (body.fileName || 'file');
      return { uploadUrl: UPLOAD_HOST + '/' + key + '?X-Amz-SignedHeaders=content-type%3Bcache-control', method: 'PUT', contentType: body.contentType, key: key, publicUrl: UPLOAD_HOST + '/' + key };
    }

    // settings, staff, access
    if (path === '/v1/admin/settings') { if (method === 'PUT') Object.assign(db.settings, body); return db.settings; }
    if (path === '/v1/admin/settings/secrets') return {};
    if (path === '/v1/admin/catalog-settings') return method === 'PUT' ? body : {};
    if (path === '/v1/admin/users') {
      if (method === 'PUT') { var su = db.users.find(function (u) { return u.phone === body.phone; }); if (su) Object.assign(su, body); else { su = Object.assign({ id: 'u' + Date.now(), status: 'ACTIVE' }, body); db.users.push(su); } return su; }
      return { users: db.users };
    }
    if ((m = path.match(/^\/v1\/admin\/users\/([^/]+)\/status$/))) { var us = db.users.find(function (u) { return u.id === m[1]; }); if (us) us.status = body.status; return us; }
    if (path.indexOf('/v1/admin/access-control') === 0) return { permissions: PERMS, roles: [{ role: 'STORE_MANAGER', defaults: ['dashboard', 'orders'], permissions: ['dashboard', 'orders', 'customers'], overridden: true, editable: true }] };
    if (path === '/v1/admin/quotes') return method === 'GET' ? { items: [], nextCursor: null } : Object.assign({ id: 'Q' + Date.now() }, body);
    if (path === '/v1/admin/audit') return { items: [], nextCursor: null };
    if (path === '/v1/admin/coupons') return { coupons: [] };
    if (path === '/v1/admin/consignments') return { items: [] };
    if (path === '/v1/admin/enquiries') return { items: [], nextCursor: null };

    // anything else: harmless defaults
    if (method === 'GET') return { items: [], nextCursor: null };
    return body || {};
  }

  function setStatus(o, status, note, extra) {
    if (!o) return {};
    o.status = status; o.updatedAt = iso(Date.now());
    o.history = (o.history || []).concat([{ at: o.updatedAt, status: status, note: note, by: 'Demo Staff' }]);
    if (extra && (extra.courier || extra.awb)) o.shipment = { courier: extra.courier, awb: extra.awb, trackingUrl: extra.trackingUrl };
    return o;
  }
  function invoiceView(o) {
    return { invoiceNo: 'WI/26-27/0101', date: o.createdAt.slice(0, 10), orderId: o.id, seller: { name: 'Wilber Impex', gstin: '29AAAAA0000A1Z5', address: 'Bengaluru, Karnataka' },
      buyer: { name: o.customer.name, phone: o.customer.phone, address: o.shippingAddress }, lines: o.lines, subtotalPaise: o.subtotalPaise, taxPaise: o.taxPaise,
      shippingPaise: o.shippingPaise, totalPaise: o.totalPaise, status: 'ISSUED', order: o };
  }
  function productDetail(p) {
    if (!p) return {};
    if (details[p.slug] || !catalogBase) return Object.assign({}, details[p.slug] || {}, p);
    return realFetch(catalogBase + 'product/' + encodeURIComponent(p.slug) + '.json').then(function (r) { return r.ok ? r.json() : {}; })
      .catch(function () { return {}; })
      .then(function (d) {
        // published detail fills descriptions/specs/images; keep the demo's stock & active flags
        var keep = { active: p.active, stockManaged: true, variants: p.variants };
        Object.assign(p, d, keep, { images: (d.images && d.images.length) ? d.images : p.images });
        details[p.slug] = d; return p;
      });
  }
  function slugify(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

  function handle(method, url, bodyText) {
    var u = new URL(url, location.href), body = {};
    try { body = bodyText ? JSON.parse(bodyText) : {}; } catch (e) { body = {}; }
    return ready.then(function () { return route(method.toUpperCase(), u.pathname, u.searchParams, body); })
      .then(function (r) { return { status: 200, text: JSON.stringify(r === undefined ? {} : r) }; })
      .catch(function (e) { console.error('[demo]', method, url, e); return { status: 500, text: JSON.stringify({ error: 'demo', message: String(e && e.message || e) }) }; });
  }
  var isApi = function (url) { return typeof url === 'string' && url.indexOf(API) === 0; };

  // ---------- XHR (Angular HttpClient) ----------
  var XO = XMLHttpRequest.prototype.open, XS = XMLHttpRequest.prototype.send, XH = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__demo = isApi(String(url)) ? { method: method, url: String(url) } : null;
    return XO.apply(this, arguments);
  };
  XMLHttpRequest.prototype.setRequestHeader = function () { if (this.__demo) return; return XH.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (bodyText) {
    var xhr = this, d = this.__demo;
    if (!d) return XS.apply(this, arguments);
    handle(d.method, d.url, typeof bodyText === 'string' ? bodyText : null).then(function (res) {
      var def = function (k, v) { Object.defineProperty(xhr, k, { configurable: true, get: function () { return v; } }); };
      def('readyState', 4); def('status', res.status); def('statusText', res.status === 200 ? 'OK' : 'Error');
      def('responseText', res.text); def('response', xhr.responseType === 'json' ? JSON.parse(res.text) : res.text); def('responseURL', d.url);
      xhr.getAllResponseHeaders = function () { return 'content-type: application/json\r\n'; };
      xhr.getResponseHeader = function (h) { return /content-type/i.test(h) ? 'application/json' : null; };
      xhr.dispatchEvent(new Event('readystatechange'));
      xhr.dispatchEvent(new ProgressEvent('load'));
      xhr.dispatchEvent(new ProgressEvent('loadend'));
    });
  };

  // ---------- fetch (uploads + anything else on the API) ----------
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || String(input);
    var method = (init && init.method) || (input && input.method) || 'GET';
    if (url.indexOf(UPLOAD_HOST) === 0 && method.toUpperCase() === 'PUT') {
      var pub = url.split('?')[0];
      if (init && init.body instanceof Blob) uploads[pub] = URL.createObjectURL(init.body);
      fixImages(document.body);
      return Promise.resolve(new Response('', { status: 200 }));
    }
    if (isApi(url)) {
      return handle(method, url, init && typeof init.body === 'string' ? init.body : null)
        .then(function (res) { return new Response(res.text, { status: res.status, headers: { 'Content-Type': 'application/json' } }); });
    }
    return realFetch(input, init);
  };

  // Uploaded files get a fake public URL; swap it for the local file so the picture shows in the demo.
  function fixImages(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('img[src^="' + UPLOAD_HOST + '"]').forEach(function (img) { var b = uploads[img.getAttribute('src')]; if (b) img.src = b; });
  }
  new MutationObserver(function (list) {
    list.forEach(function (m) {
      if (m.type === 'attributes' && m.target.tagName === 'IMG') { var b = uploads[m.target.getAttribute('src')]; if (b) m.target.src = b; }
      m.addedNodes && m.addedNodes.forEach(function (n) { if (n.nodeType === 1) { if (n.tagName === 'IMG') fixImages(n.parentNode); else fixImages(n); } });
    });
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] });
})();
