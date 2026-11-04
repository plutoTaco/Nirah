// NIRAH data layer. In this front-end prototype it stands in for the server:
// every write runs as one transaction under a cross-tab lock, re-reads the
// latest data, re-validates prices and stock, and records an audit trail.
(() => {
  const N = window.Nirah;
  const { round2, uid, money } = N.ui;

  const KEY = "nirah:db:v1";
  const CART_KEY = "nirah:cart";
  const CUSTOMER_KEY = "nirah:customer";
  const ADMIN_KEY = "nirah:admin";
  const ACCESS_KEY = "nirah:order-access";
  const DAY = 86400000;
  const OPEN_STATES = ["Paid", "Processing", "Packed"];
  const RECEIVED_STATES = ["Delivered", "Return Requested", "Returned", "Refunded"];

  let db = null;
  const listeners = new Set();
  const emit = (why) => listeners.forEach((fn) => fn(why));
  const load = () => {
    try {
      return JSON.parse(localStorage.getItem(KEY));
    } catch {
      return null;
    }
  };
  const save = (data) => localStorage.setItem(KEY, JSON.stringify(data));

  class Fail extends Error {}
  const fail = (message) => {
    throw new Fail(message);
  };

  // ----- Crypto: salted password hashing and webhook signatures -----
  const enc = new TextEncoder();
  const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  async function hashPassword(password, salt = hex(crypto.getRandomValues(new Uint8Array(16)))) {
    const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: 60000 }, key, 256);
    return { salt, hash: hex(bits) };
  }
  async function verifyPassword(password, record) {
    if (!record?.salt) return false;
    return (await hashPassword(password, record.salt)).hash === record.hash;
  }
  async function hmac(secret, message) {
    const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return hex(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
  }

  // Brute-force protection for sign-in forms.
  const attempts = new Map();
  const throttle = (key) => {
    const a = attempts.get(key);
    if (a && a.count >= 5 && Date.now() - a.at < 60000) fail("Too many attempts. Please wait a minute and try again.");
  };
  const noteFailure = (key) => {
    const a = attempts.get(key) || { count: 0, at: 0 };
    attempts.set(key, { count: Date.now() - a.at > 60000 ? 1 : a.count + 1, at: Date.now() });
  };

  // ----- Transactions -----
  // fn runs synchronously on a fresh copy of the data. Throwing aborts the
  // transaction with nothing saved; returning commits it.
  async function tx(fn) {
    const run = () => {
      const fresh = load();
      sweepExpired(fresh);
      const result = fn(fresh);
      save(fresh);
      db = fresh;
      emit("data");
      return result;
    };
    return navigator.locks ? navigator.locks.request("nirah-db", run) : run();
  }

  const nextId = (d, key, prefix) => `${prefix}-${d.ids[key]++}`;
  const move = (d, sku, type, qty, reason, ref, actor) =>
    d.movements.push({ id: nextId(d, "movement", "mv"), sku, type, qty, reason, ref, actor, at: Date.now() });

  // Releases reservations whose payment window has passed.
  function sweepExpired(d, now = Date.now()) {
    const touched = new Set();
    for (const r of d.reservations) {
      if (r.state !== "active" || r.expiresAt > now) continue;
      r.state = "released";
      move(d, r.sku, "release", r.qty, "Payment window expired", r.orderId, "System");
      touched.add(r.orderId);
    }
    for (const id of touched) {
      const o = d.orders.find((x) => x.id === id);
      if (!o || o.paymentState !== "pending") continue;
      o.paymentState = "expired";
      o.history.push({ status: o.status, at: now, by: "System", note: "Payment window expired; held stock released" });
      d.payments.filter((p) => p.orderId === id && p.state === "pending").forEach((p) => (p.state = "expired"));
    }
    if (d.reservations.length > 400) d.reservations = d.reservations.filter((r) => r.state === "active" || now - r.expiresAt < 7 * DAY);
    return touched.size > 0;
  }

  // ----- Catalogue -----
  const catById = (id, d = db) => d.categories.find((c) => c.id === id);
  const categoryChain = (id, d = db) => {
    const chain = [];
    let c = catById(id, d);
    while (c && !chain.includes(c.id)) {
      chain.push(c.id);
      c = c.parentId ? catById(c.parentId, d) : null;
    }
    return chain;
  };
  const catVisible = (c, d = db) => !!c && c.active && !c.archived && (!c.parentId || catVisible(catById(c.parentId, d), d));
  const descendants = (id, d = db) => {
    const out = [id];
    for (let i = 0; i < out.length; i += 1) d.categories.filter((c) => c.parentId === out[i]).forEach((c) => out.push(c.id));
    return out;
  };
  const isPublic = (p, d = db) => !!p && p.status === "published" && catVisible(catById(p.categoryId, d), d);
  const publicProducts = (d = db) => d.products.filter((p) => isPublic(p, d));
  const productBySku = (sku, d = db) => d.products.find((p) => p.sku === sku);
  const productById = (id, d = db) => d.products.find((p) => p.id === id);
  const productBySlug = (slug, d = db) => d.products.find((p) => p.slug === slug);

  function stockOf(sku, d = db, now = Date.now()) {
    const inv = d.inventory[sku] || { onHand: 0, quarantine: 0, committed: 0, reorder: d.settings.lowStockDefault };
    const reserved = d.reservations
      .filter((r) => r.sku === sku && r.state === "active" && r.expiresAt > now)
      .reduce((s, r) => s + r.qty, 0);
    // Available-to-sell = sellable on hand − paid-but-not-shipped − held for checkout.
    const available = Math.max(0, inv.onHand - inv.committed - reserved);
    const status = available <= 0 ? "out" : available <= inv.reorder ? "low" : "in";
    return { ...inv, reserved, available, status };
  }

  // ----- Pricing and the discount engine -----
  const taxRate = (d, p) => d.settings.taxClasses[p.taxClass]?.rate ?? 18;
  function promoState(promo, now = Date.now()) {
    if (promo.archived) return "archived";
    if (!promo.active) return "inactive";
    if (now < promo.startsAt) return "scheduled";
    if (now >= promo.endsAt) return "expired";
    if (promo.usageLimit && promo.used >= promo.usageLimit) return "exhausted";
    return "active";
  }
  function promoApplies(promo, p, d = db) {
    if (p.noPromo || promo.excludeSkus?.includes(p.sku)) return false;
    if (promo.skus?.includes(p.sku)) return true;
    if (promo.type === "product") return false;
    if (!promo.categoryIds?.length) return promo.type === "coupon";
    const chain = categoryChain(p.categoryId, d);
    return promo.categoryIds.some((id) => chain.includes(id));
  }
  const roundPrice = (v, d) => {
    const step = d.settings.roundPricesTo || 0.01;
    return round2(Math.round(v / step) * step);
  };
  const floorFor = (p, d) => (p.minPrice != null && p.minPrice !== "" ? Number(p.minPrice) : round2((p.price * d.settings.priceFloorPercent) / 100));
  const promoPrice = (promo, regular) => (promo.mode === "percent" ? regular * (1 - promo.value / 100) : regular - promo.value);

  // No stacking: the single valid promotion giving the lowest price wins,
  // never below the product's floor unless the promotion is authorised to.
  function pricing(p, d = db, now = Date.now(), extra = null) {
    const regular = p.price;
    const floor = floorFor(p, d);
    let best = { price: regular, promo: null };
    const promos = extra ? [...d.promotions.filter((x) => x.id !== extra.id), extra] : d.promotions;
    for (const promo of promos) {
      if (promo.type === "coupon" || promoState(promo, now) !== "active" || !promoApplies(promo, p, d)) continue;
      let price = roundPrice(promoPrice(promo, regular), d);
      if (!promo.allowBelowFloor) price = Math.max(price, floor);
      if (price <= 0 || price >= regular) continue;
      if (price < best.price) best = { price, promo };
    }
    const saving = round2(regular - best.price);
    return { regular, price: best.price, promo: best.promo, saving, percent: saving > 0 ? Math.round((saving / regular) * 100) : 0, floor };
  }

  // ----- Discovery: search, listing, best sellers, new arrivals -----
  const words = (s) => String(s || "").toLowerCase().match(/[a-z0-9]+/g) || [];
  function search(q, d = db) {
    const terms = words(q);
    if (!terms.length) return [];
    const syn = d.settings.searchSynonyms || {};
    const groups = terms.map((t) => [t, ...(syn[t] || [])]);
    const promoted = d.settings.promotedSearch?.[String(q).trim().toLowerCase()] || [];
    const results = [];
    for (const p of publicProducts(d)) {
      const fields = [
        [words(p.title), 5],
        [[p.sku.toLowerCase()], 6],
        [words(p.brand), 3],
        [words(catById(p.categoryId, d)?.name), 3],
        [words(`${p.keywords} ${(p.tags || []).join(" ")}`), 2],
        [words(p.short), 2],
        [words(`${p.material} ${p.color} ${(p.specs || []).map((s) => s.join(" ")).join(" ")}`), 1],
        [words(p.description), 0.5],
      ];
      let score = 0;
      let matched = 0;
      for (const group of groups) {
        let best = 0;
        for (const [list, weight] of fields) {
          if (list.some((w) => group.some((t) => w === t || (t.length > 2 && w.startsWith(t)) || (t.length > 5 && w.includes(t))))) best = Math.max(best, weight);
        }
        if (best) matched += 1;
        score += best;
      }
      const isPromoted = promoted.includes(p.id);
      if (matched === groups.length || isPromoted) results.push({ product: p, score: score + (isPromoted ? 100 : 0), promoted: isPromoted });
    }
    return results.sort((a, b) => b.score - a.score);
  }

  function unitsSold(d, days, now = Date.now()) {
    const since = now - days * DAY;
    const units = {};
    for (const o of d.orders) {
      if (o.createdAt < since || o.paymentState !== "paid" || o.status === "Cancelled") continue;
      const returned = d.settings.bestSellers.deductReturns && ["Returned", "Refunded"].includes(o.status);
      if (returned) continue;
      for (const l of o.lines) units[l.sku] = (units[l.sku] || 0) + l.qty;
    }
    return units;
  }

  function bestSellers({ windowDays, limit, categoryId, includeOutOfStock = false, d = db } = {}) {
    const cfg = d.settings.bestSellers;
    const units = unitsSold(d, windowDays || cfg.windowDays);
    const cats = categoryId ? descendants(categoryId, d) : null;
    return publicProducts(d)
      .filter((p) => (!cats || cats.includes(p.categoryId)) && (includeOutOfStock || stockOf(p.sku, d).available > 0))
      .filter((p) => cfg.auto || p.bestPin)
      .map((p) => ({ product: p, units: units[p.sku] || 0, pinned: !!p.bestPin }))
      .sort((a, b) => (b.pinned - a.pinned) || ((a.product.bestPin || 0) - (b.product.bestPin || 0)) || b.units - a.units)
      .slice(0, limit || cfg.topN);
  }

  const isNew = (p, d = db) => p.publishedAt && Date.now() - p.publishedAt < d.settings.newArrivalDays * DAY;
  const newArrivals = (limit = 12, d = db) =>
    publicProducts(d)
      .sort((a, b) => b.publishedAt - a.publishedAt)
      .slice(0, limit);

  function listing({ categoryId, q, min, max, inStock, onOffer, material, color, sort = "featured" } = {}) {
    const units = unitsSold(db, db.settings.bestSellers.windowDays);
    let rows = (q ? search(q).map((r) => r.product) : publicProducts()).map((p) => ({ p, price: pricing(p), stock: stockOf(p.sku) }));
    if (categoryId) {
      const cats = descendants(categoryId);
      rows = rows.filter((r) => cats.includes(r.p.categoryId));
    }
    const facetsFrom = rows;
    if (min != null && min !== "") rows = rows.filter((r) => r.price.price >= Number(min));
    if (max != null && max !== "") rows = rows.filter((r) => r.price.price <= Number(max));
    if (inStock) rows = rows.filter((r) => r.stock.available > 0);
    if (onOffer) rows = rows.filter((r) => r.price.promo);
    const firstWord = (s) => String(s || "").split(/[ ,/]/)[0];
    if (material?.length) rows = rows.filter((r) => material.some((m) => r.p.material?.toLowerCase().includes(m.toLowerCase())));
    if (color?.length) rows = rows.filter((r) => color.includes(firstWord(r.p.color)));
    const outLast = (a, b) => (a.stock.available > 0 ? 0 : 1) - (b.stock.available > 0 ? 0 : 1);
    const sorters = {
      featured: (a, b) => outLast(a, b) || (b.p.featuredRank || 0) - (a.p.featuredRank || 0) || (units[b.p.sku] || 0) - (units[a.p.sku] || 0),
      best: (a, b) => outLast(a, b) || (units[b.p.sku] || 0) - (units[a.p.sku] || 0),
      new: (a, b) => b.p.publishedAt - a.p.publishedAt,
      "price-asc": (a, b) => a.price.price - b.price.price,
      "price-desc": (a, b) => b.price.price - a.price.price,
      relevance: () => 0,
    };
    rows.sort(sorters[sort] || sorters.featured);
    const materials = [...new Set(facetsFrom.map((r) => r.p.material?.split(/[,;]/)[0].replace(/^\d+% /, "").trim()).filter(Boolean))].sort();
    const colors = [...new Set(facetsFrom.map((r) => firstWord(r.p.color)).filter((c) => c && c !== "—"))].sort();
    return { rows, facets: { materials, colors, total: facetsFrom.length } };
  }

  // ----- Reviews -----
  const approvedReviews = (productId) =>
    db.reviews.filter((r) => r.productId === productId && r.state === "approved").sort((a, b) => b.createdAt - a.createdAt);
  function ratingSummary(productId) {
    const list = approvedReviews(productId);
    const dist = [0, 0, 0, 0, 0];
    list.forEach((r) => (dist[r.rating - 1] += 1));
    return { count: list.length, avg: list.length ? list.reduce((s, r) => s + r.rating, 0) / list.length : 0, dist };
  }

  // ----- Shipping -----
  function shippingQuote(pincode, merchandise = 0, d = db) {
    const pin = String(pincode || "").trim();
    if (!/^[1-9][0-9]{5}$/.test(pin)) return { valid: false, serviceable: false, message: "Enter a valid 6-digit pincode." };
    const s = d.settings.shipping;
    if (s.blockedPrefixes.some((x) => pin.startsWith(x))) return { valid: true, serviceable: false, message: "Sorry, we do not deliver to this pincode yet." };
    let zone = null;
    let len = 0;
    for (const z of s.zones) for (const prefix of z.prefixes) if (pin.startsWith(prefix) && prefix.length > len) [zone, len] = [z, prefix.length];
    if (!zone) return { valid: true, serviceable: false, message: "Sorry, we do not deliver to this pincode yet." };
    const fee = merchandise >= zone.freeAbove ? 0 : zone.fee;
    return { valid: true, serviceable: true, zone, fee, eta: zone.eta, freeAbove: zone.freeAbove, message: `Delivery to ${pin}: estimated ${zone.eta}` };
  }

  // ----- Cart -----
  const emptyCart = () => ({ items: [], coupon: null, pincode: "" });
  const cart = {
    get() {
      try {
        return { ...emptyCart(), ...JSON.parse(localStorage.getItem(CART_KEY)) };
      } catch {
        return emptyCart();
      }
    },
    save(c) {
      localStorage.setItem(CART_KEY, JSON.stringify(c));
      emit("cart");
    },
    count() {
      return cart.get().items.reduce((s, i) => s + i.qty, 0);
    },
    // Availability is checked before anything goes into the cart.
    set(sku, qty, { add = false } = {}) {
      const p = productBySku(sku);
      if (!isPublic(p)) return { ok: false, message: "This product is not available." };
      const c = cart.get();
      const line = c.items.find((i) => i.sku === sku);
      const current = line?.qty || 0;
      const wanted = add ? current + qty : qty;
      if (wanted <= 0) {
        cart.remove(sku);
        return { ok: true, qty: 0, message: "Removed from cart" };
      }
      const limit = Math.min(stockOf(sku).available, p.maxPerOrder);
      if (limit <= 0) return { ok: false, message: `${p.title} is out of stock.` };
      const final = Math.min(wanted, limit);
      if (add && final === current) return { ok: false, message: `You already have the most we can sell you (${limit}) in your cart.` };
      const price = pricing(p).price;
      if (line) Object.assign(line, { qty: final, seenPrice: price });
      else c.items.push({ sku, qty: final, seenPrice: price, title: p.title });
      cart.save(c);
      track("add", p.id);
      const capped = final < wanted;
      return { ok: true, qty: final, capped, message: capped ? `Only ${limit} available, so your cart has ${final}.` : add ? `${p.title} added to your cart` : "Cart updated" };
    },
    add: (sku, qty = 1) => cart.set(sku, qty, { add: true }),
    remove(sku) {
      const c = cart.get();
      c.items = c.items.filter((i) => i.sku !== sku);
      cart.save(c);
    },
    clear() {
      const c = cart.get();
      cart.save({ ...emptyCart(), pincode: c.pincode });
    },
    setCoupon(code) {
      const c = cart.get();
      c.coupon = code ? String(code).trim().toUpperCase() : null;
      cart.save(c);
    },
    setPincode(pin) {
      const c = cart.get();
      c.pincode = String(pin || "").trim();
      cart.save(c);
    },
    // Accept the current prices after the customer has seen them.
    acknowledge(q) {
      const c = cart.get();
      for (const item of c.items) {
        const line = q.lines.find((l) => l.sku === item.sku);
        if (line) Object.assign(item, { qty: line.qty || item.qty, seenPrice: line.unit });
      }
      c.items = c.items.filter((i) => q.lines.some((l) => l.sku === i.sku && l.qty > 0));
      cart.save(c);
    },
  };

  function evaluateCoupon(code, lines, { email, d = db } = {}) {
    const promo = d.promotions.find((p) => p.type === "coupon" && p.code?.toUpperCase() === String(code).toUpperCase());
    if (!promo) return { ok: false, code, message: `"${code}" is not a valid code.` };
    const state = promoState(promo);
    const why = { scheduled: "is not active yet", expired: "has expired", exhausted: "has reached its usage limit", inactive: "is not available", archived: "is not available" };
    if (state !== "active") return { ok: false, code, message: `${promo.code} ${why[state]}.` };
    const scoped = promo.skus.length || promo.categoryIds.length;
    const eligible = lines.filter((l) => l.qty > 0 && (d.settings.couponStacking || !l.promo) && (!scoped || promoApplies(promo, l.p, d)));
    if (!eligible.length) return { ok: false, code, message: `${promo.code} cannot be combined with items already on offer.` };
    const base = round2(eligible.reduce((s, l) => s + l.lineTotal, 0));
    if (promo.minSpend && base < promo.minSpend) return { ok: false, code, message: `Add ${money(promo.minSpend - base)} more of eligible items to use ${promo.code}.` };
    if (email && promo.perCustomerLimit) {
      const used = d.orders.filter((o) => o.coupon?.code === promo.code && o.email === email.toLowerCase() && o.paymentState === "paid").length;
      if (used >= promo.perCustomerLimit) return { ok: false, code, message: `You have already used ${promo.code}.` };
    }
    const amount = round2(promo.mode === "percent" ? (base * promo.value) / 100 : Math.min(promo.value, base - 1));
    return { ok: true, code: promo.code, promoId: promo.id, name: promo.name, amount, eligibleSkus: eligible.map((l) => l.sku), base };
  }

  // Re-prices and re-checks the cart from current data. Used for the cart page,
  // at checkout and again inside the order transaction.
  function quote(c = cart.get(), { pincode = c.pincode, email = null, d = db } = {}) {
    const issues = [];
    const lines = [];
    for (const item of c.items) {
      const p = productBySku(item.sku, d);
      if (!isPublic(p, d)) {
        issues.push({ sku: item.sku, type: "removed", message: `${item.title || "An item"} is no longer available and will be removed.` });
        continue;
      }
      const st = stockOf(p.sku, d);
      const pr = pricing(p, d);
      const limit = Math.min(st.available, p.maxPerOrder);
      let qty = item.qty;
      if (limit <= 0) {
        issues.push({ sku: p.sku, type: "out", message: `${p.title} has just sold out and will be removed.` });
        qty = 0;
      } else if (qty > limit) {
        issues.push({ sku: p.sku, type: "reduced", message: `Only ${limit} of ${p.title} can be ordered right now, so the quantity is now ${limit}.` });
        qty = limit;
      }
      if (qty > 0 && item.seenPrice != null && round2(item.seenPrice) !== pr.price) {
        issues.push({ sku: p.sku, type: "price", message: `The price of ${p.title} changed from ${money(item.seenPrice)} to ${money(pr.price)}.` });
      }
      lines.push({ p, sku: p.sku, qty, regular: pr.regular, unit: pr.price, promo: pr.promo, percent: pr.percent, lineRegular: pr.regular * qty, lineTotal: round2(pr.price * qty), available: st.available, limit, taxRate: taxRate(d, p) });
    }
    const sellable = lines.filter((l) => l.qty > 0);
    const regularTotal = round2(sellable.reduce((s, l) => s + l.lineRegular, 0));
    const beforeCoupon = round2(sellable.reduce((s, l) => s + l.lineTotal, 0));
    const coupon = c.coupon ? evaluateCoupon(c.coupon, sellable, { email, d }) : null;
    const couponAmount = coupon?.ok ? coupon.amount : 0;
    const merchandise = round2(beforeCoupon - couponAmount);
    const ship = pincode ? shippingQuote(pincode, merchandise, d) : null;
    const shipping = ship?.serviceable ? ship.fee : 0;
    // Prices include GST: work out the tax inside each line after its coupon share.
    let tax = 0;
    for (const l of sellable) {
      const share = coupon?.ok && coupon.eligibleSkus.includes(l.sku) ? (l.lineTotal / coupon.base) * couponAmount : 0;
      l.couponShare = round2(share);
      const net = l.lineTotal - share;
      l.tax = round2(net - net / (1 + l.taxRate / 100));
      tax += l.tax;
    }
    const shippingTax = round2(shipping - shipping / (1 + d.settings.shippingTaxRate / 100));
    return {
      lines,
      sellable,
      issues,
      regularTotal,
      autoDiscount: round2(regularTotal - beforeCoupon),
      coupon,
      couponAmount,
      merchandise,
      ship,
      shipping,
      shippingTax,
      tax: round2(tax + shippingTax),
      total: round2(merchandise + shipping),
      count: sellable.reduce((s, l) => s + l.qty, 0),
      belowMinimum: d.settings.orderMinimum > 0 && merchandise < d.settings.orderMinimum,
    };
  }

  // ----- Customers -----
  const currentCustomer = () => db.customers.find((c) => c.id === localStorage.getItem(CUSTOMER_KEY) && c.hash) || null;
  const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || ""));
  const validPhone = (p) => /^[6-9]\d{9}$/.test(String(p || "").replace(/\D/g, "").slice(-10));

  async function register({ name, email, phone, password, marketingConsent }) {
    email = String(email || "").trim().toLowerCase();
    if (!String(name || "").trim()) fail("Please enter your name.");
    if (!validEmail(email)) fail("Please enter a valid email address.");
    if (String(password || "").length < 8) fail("Use at least 8 characters for your password.");
    const rec = await hashPassword(password);
    const c = await tx((d) => {
      let c = d.customers.find((x) => x.email === email);
      if (c?.hash) fail("An account with this email already exists. Try signing in.");
      if (!c) {
        c = { id: uid("cus"), email, addresses: [], createdAt: Date.now() };
        d.customers.push(c);
      }
      Object.assign(c, { name: name.trim(), phone: String(phone || "").trim(), marketingConsent: !!marketingConsent, ...rec });
      return c;
    });
    localStorage.setItem(CUSTOMER_KEY, c.id);
    emit("auth");
    return c;
  }
  async function signIn(email, password) {
    email = String(email || "").trim().toLowerCase();
    throttle(`c:${email}`);
    const c = db.customers.find((x) => x.email === email);
    if (!c || !(await verifyPassword(password, c))) {
      noteFailure(`c:${email}`);
      fail("Email or password is incorrect.");
    }
    localStorage.setItem(CUSTOMER_KEY, c.id);
    emit("auth");
    return c;
  }
  function signOut() {
    localStorage.removeItem(CUSTOMER_KEY);
    emit("auth");
  }
  async function updateCustomer(patch) {
    const me = currentCustomer();
    if (!me) fail("Please sign in.");
    return tx((d) => {
      const c = d.customers.find((x) => x.id === me.id);
      if (patch.name !== undefined) c.name = String(patch.name).trim() || c.name;
      if (patch.phone !== undefined) c.phone = String(patch.phone).trim();
      if (patch.marketingConsent !== undefined) c.marketingConsent = !!patch.marketingConsent;
      if (patch.address) {
        const a = { id: patch.address.id || uid("addr"), ...patch.address };
        const i = c.addresses.findIndex((x) => x.id === a.id);
        if (i >= 0) c.addresses[i] = a;
        else c.addresses.push(a);
      }
      if (patch.removeAddress) c.addresses = c.addresses.filter((a) => a.id !== patch.removeAddress);
      return c;
    });
  }

  // Guests can open an order only from this browser (after placing it) or by
  // proving the order number together with the email or phone used.
  const accessList = () => {
    try {
      return JSON.parse(sessionStorage.getItem(ACCESS_KEY)) || {};
    } catch {
      return {};
    }
  };
  const rememberAccess = (id, token) => sessionStorage.setItem(ACCESS_KEY, JSON.stringify({ ...accessList(), [id]: token }));
  function orderFor(id) {
    const o = db.orders.find((x) => x.id === id);
    if (!o) return null;
    const me = currentCustomer();
    if ((me && o.customerId === me.id) || accessList()[id] === o.token) return o;
    return null;
  }
  function lookupOrder(number, contact) {
    const id = String(number || "").trim().toUpperCase();
    throttle(`lookup:${id}`);
    const c = String(contact || "").trim().toLowerCase();
    const digits = c.replace(/\D/g, "").slice(-10);
    const o = db.orders.find((x) => x.id === id);
    if (!o || !(o.email === c || (digits.length === 10 && String(o.phone).replace(/\D/g, "").slice(-10) === digits))) {
      noteFailure(`lookup:${id}`);
      fail("We couldn't find an order with those details. Check the order number and the email or phone used at checkout.");
    }
    rememberAccess(o.id, o.token);
    return o;
  }
  const ordersForCustomer = () => {
    const me = currentCustomer();
    return me ? db.orders.filter((o) => o.customerId === me.id).sort((a, b) => b.createdAt - a.createdAt) : [];
  };

  // ----- Checkout -----
  function validateCheckout(form) {
    const errors = {};
    if (!String(form.name || "").trim()) errors.name = "Enter your full name.";
    if (!validEmail(form.email)) errors.email = "Enter a valid email address.";
    if (!validPhone(form.phone)) errors.phone = "Enter a 10-digit mobile number.";
    const a = form.address || {};
    if (!String(a.line1 || "").trim()) errors.line1 = "Enter your house and street.";
    if (!String(a.city || "").trim()) errors.city = "Enter your city.";
    if (!String(a.state || "").trim()) errors.state = "Enter your state.";
    const ship = shippingQuote(a.pincode);
    if (!ship.serviceable) errors.pincode = ship.message;
    return errors;
  }

  // Validates everything server-side style, holds the stock and opens a
  // payment session. Nothing is charged here.
  async function placeOrder(form) {
    const errors = validateCheckout(form);
    if (Object.keys(errors).length) return { ok: false, errors };
    if (!form.acceptTerms) return { ok: false, errors: { terms: "Please accept the terms to continue." } };
    const me = currentCustomer();
    const c = cart.get();
    const email = form.email.trim().toLowerCase();

    const res = await tx((d) => {
      const q = quote(c, { pincode: form.address.pincode, email, d });
      if (!q.sellable.length) return { ok: false, issues: [{ type: "empty", message: "Your cart is empty." }] };
      if (q.issues.length) return { ok: false, issues: q.issues, quote: q };
      if (form.expectedTotal != null && round2(form.expectedTotal) !== q.total) {
        return { ok: false, issues: [{ type: "price", message: `Your total is now ${money(q.total)}. Please review it before paying.` }], quote: q };
      }
      if (q.coupon && !q.coupon.ok) return { ok: false, issues: [{ type: "coupon", message: q.coupon.message }], quote: q };
      if (q.belowMinimum) return { ok: false, issues: [{ type: "minimum", message: `The minimum order is ${money(d.settings.orderMinimum)}.` }] };
      if (!d.settings.paymentMethods[form.method]) return { ok: false, issues: [{ type: "method", message: "Choose an available payment method." }] };

      const id = nextId(d, "order", "NRH");
      const now = Date.now();
      const expiresAt = now + d.settings.reservationMinutes * 60000;
      for (const l of q.sellable) {
        d.reservations.push({ id: uid("res"), sku: l.sku, qty: l.qty, orderId: id, expiresAt, state: "active", createdAt: now });
        move(d, l.sku, "reserve", -l.qty, "Held for checkout", id, "System");
      }
      const order = {
        id,
        token: Math.random().toString(36).slice(2, 12),
        customerId: me?.id || null,
        name: form.name.trim(),
        email,
        phone: form.phone.trim(),
        address: { ...form.address },
        lines: q.sellable.map((l) => ({
          productId: l.p.id,
          sku: l.sku,
          title: l.p.title,
          image: l.p.images[0]?.src || "",
          short: l.p.short,
          qty: l.qty,
          regular: l.regular,
          unit: l.unit,
          promoId: l.promo?.id || null,
          promoName: l.promo?.name || "",
          couponShare: l.couponShare,
          taxRate: l.taxRate,
          tax: l.tax,
          returnable: l.p.returnable,
        })),
        regularTotal: q.regularTotal,
        autoDiscount: q.autoDiscount,
        coupon: q.coupon?.ok ? { code: q.coupon.code, promoId: q.coupon.promoId, amount: q.couponAmount } : null,
        merchandise: q.merchandise,
        shipping: q.shipping,
        shippingZone: q.ship.zone.name,
        eta: q.ship.eta,
        tax: q.tax,
        total: q.total,
        status: "Placed",
        paymentState: "pending",
        method: form.method,
        createdAt: now,
        reservedUntil: expiresAt,
        history: [{ status: "Placed", at: now, by: "Customer", note: "Stock held while payment is completed" }],
        courier: "",
        trackingId: "",
        notes: [],
        cancelRequest: null,
        returnRequest: null,
        marketingConsent: !!form.marketingConsent,
        notifications: [],
      };
      d.orders.push(order);
      const payment = { id: nextId(d, "payment", "pay"), orderId: id, sessionId: null, attempt: 1, method: form.method, amount: q.total, state: "pending", idempotencyKey: `${id}:1`, gatewayTxnId: "", createdAt: now, updatedAt: now };
      d.payments.push(payment);
      if (me) {
        const cust = d.customers.find((x) => x.id === me.id);
        if (form.saveAddress && !cust.addresses.some((a) => a.line1 === form.address.line1 && a.pincode === form.address.pincode)) {
          cust.addresses.push({ id: uid("addr"), label: "Saved", name: order.name, phone: order.phone, ...form.address });
        }
      }
      return { ok: true, orderId: id, token: order.token, paymentId: payment.id, amount: q.total, key: payment.idempotencyKey };
    });
    if (!res.ok) return res;
    rememberAccess(res.orderId, res.token);
    cart.clear();
    return openPayment(res);
  }

  async function openPayment({ orderId, paymentId, amount, key }) {
    const session = await N.gateway.createSession({ merchantRef: orderId, paymentId, amount, idempotencyKey: key, methods: db.settings.paymentMethods });
    await tx((d) => {
      const p = d.payments.find((x) => x.id === paymentId);
      if (p) p.sessionId = session.id;
    });
    return { ok: true, orderId, sessionId: session.id };
  }

  // A fresh payment attempt for an unpaid order: re-holds stock if the old
  // hold lapsed, and never creates a second order or a duplicate hold.
  async function retryPayment(orderId) {
    const res = await tx((d) => {
      const o = d.orders.find((x) => x.id === orderId);
      if (!o) fail("Order not found.");
      if (o.paymentState === "paid") fail("This order is already paid.");
      if (o.status === "Cancelled") fail("This order was cancelled.");
      const now = Date.now();
      const holds = d.reservations.filter((r) => r.orderId === o.id && r.state === "active" && r.expiresAt > now);
      const open = d.payments.find((p) => p.orderId === o.id && p.state === "pending" && p.sessionId);
      if (open && holds.length) return { reuse: open.sessionId };
      if (!holds.length) {
        for (const l of o.lines) {
          if (stockOf(l.sku, d).available < l.qty) fail(`Sorry, ${l.title} is no longer available in the quantity you ordered, so this order can't be paid. Nothing has been charged.`);
        }
        const expiresAt = now + d.settings.reservationMinutes * 60000;
        for (const l of o.lines) {
          d.reservations.push({ id: uid("res"), sku: l.sku, qty: l.qty, orderId: o.id, expiresAt, state: "active", createdAt: now });
          move(d, l.sku, "reserve", -l.qty, "Held again for payment retry", o.id, "System");
        }
        o.reservedUntil = expiresAt;
      }
      d.payments.filter((p) => p.orderId === o.id && p.state === "pending").forEach((p) => (p.state = "superseded"));
      const attempt = d.payments.filter((p) => p.orderId === o.id).length + 1;
      const payment = { id: nextId(d, "payment", "pay"), orderId: o.id, sessionId: null, attempt, method: o.method, amount: o.total, state: "pending", idempotencyKey: `${o.id}:${attempt}`, gatewayTxnId: "", createdAt: now, updatedAt: now };
      d.payments.push(payment);
      o.paymentState = "pending";
      o.history.push({ status: o.status, at: now, by: "Customer", note: `Payment attempt ${attempt} started` });
      return { orderId: o.id, paymentId: payment.id, amount: o.total, key: payment.idempotencyKey };
    });
    if (res.reuse) return { ok: true, orderId, sessionId: res.reuse };
    return openPayment(res);
  }

  // Only a correctly signed gateway notification can mark an order paid.
  // Replays of the same event are recorded and ignored.
  async function handleWebhook(body, signature) {
    const event = JSON.parse(body);
    const valid = (await hmac(db.settings.gateway.webhookSecret, body)) === signature;
    return tx((d) => {
      const now = Date.now();
      const data = event.data || {};
      const log = { id: event.id, type: event.type, sessionId: data.sessionId, orderId: data.merchantRef, amount: data.amount, receivedAt: now, signatureValid: valid, outcome: "" };
      const seen = d.webhookEvents.some((e) => e.id === event.id && e.outcome.startsWith("applied"));
      d.webhookEvents.unshift(log);
      d.webhookEvents = d.webhookEvents.slice(0, 300);
      if (!valid) return (log.outcome = "rejected: signature did not verify"), log;
      if (seen) return (log.outcome = "ignored: duplicate event"), log;
      const pay = d.payments.find((p) => p.sessionId === data.sessionId);
      const o = pay && d.orders.find((x) => x.id === pay.orderId);
      if (!pay || !o) return (log.outcome = "ignored: unknown payment session"), log;

      if (event.type === "payment.captured") {
        if (pay.state === "captured") return (log.outcome = "ignored: already captured"), log;
        if (round2(data.amount) !== round2(pay.amount)) {
          pay.state = "mismatch";
          o.paymentState = "review";
          o.exception = `Gateway amount ${money(data.amount)} does not match ${money(pay.amount)}`;
          return (log.outcome = "applied: amount mismatch sent to exception queue"), log;
        }
        Object.assign(pay, { state: "captured", gatewayTxnId: data.txnId, method: data.method || pay.method, updatedAt: now });
        if (o.paymentState === "paid") {
          d.refunds.push({ id: nextId(d, "refund", "ref"), orderId: o.id, paymentId: pay.id, amount: pay.amount, reason: "Duplicate capture from a second payment attempt", state: "requested", requestedBy: "System", createdAt: now });
          return (log.outcome = "applied: duplicate capture queued for refund"), log;
        }
        const holds = d.reservations.filter((r) => r.orderId === o.id && r.state === "active");
        if (holds.length) {
          for (const r of holds) {
            r.state = "converted";
            d.inventory[r.sku].committed += r.qty;
            move(d, r.sku, "commit", 0, "Payment confirmed; allocated to order", o.id, "System");
          }
        } else {
          // The hold lapsed before the money arrived: allocate again if we can.
          const short = o.lines.filter((l) => stockOf(l.sku, d).available < l.qty);
          if (short.length) {
            o.exception = `Paid after the stock hold expired; not enough stock for ${short.map((l) => l.title).join(", ")}`;
          } else {
            for (const l of o.lines) {
              d.inventory[l.sku].committed += l.qty;
              move(d, l.sku, "commit", 0, "Late payment confirmed; allocated to order", o.id, "System");
            }
          }
        }
        o.paymentState = "paid";
        o.status = "Paid";
        o.paidAt = now;
        o.history.push({ status: "Paid", at: now, by: "Gateway webhook", note: `Verified transaction ${data.txnId}` });
        o.notifications = [...(o.notifications || []), { channel: "email", to: o.email, template: "Order confirmation", at: now }];
        if (o.coupon) {
          const promo = d.promotions.find((p) => p.id === o.coupon.promoId);
          if (promo) promo.used += 1;
        }
        d.payments.filter((p) => p.orderId === o.id && p.state === "pending").forEach((p) => (p.state = "superseded"));
        return (log.outcome = "applied: order marked paid"), log;
      }

      if (event.type === "payment.failed") {
        if (pay.state === "captured") return (log.outcome = "ignored: payment already captured"), log;
        Object.assign(pay, { state: "failed", failureReason: data.reason || "Declined", updatedAt: now });
        if (o.paymentState !== "paid") {
          for (const r of d.reservations.filter((x) => x.orderId === o.id && x.state === "active")) {
            r.state = "released";
            move(d, r.sku, "release", r.qty, "Payment failed", o.id, "System");
          }
          o.paymentState = "failed";
          o.history.push({ status: o.status, at: now, by: "Gateway webhook", note: `Payment failed: ${data.reason || "declined"}. Held stock released.` });
        }
        return (log.outcome = "applied: payment failed, stock released"), log;
      }
      return (log.outcome = "ignored: unhandled event type"), log;
    });
  }

  // ----- Customer requests -----
  async function requestCancel(orderId, reason) {
    return tx((d) => {
      const o = d.orders.find((x) => x.id === orderId);
      if (!o) fail("Order not found.");
      const now = Date.now();
      if (o.status === "Placed" && o.paymentState !== "paid") {
        for (const r of d.reservations.filter((x) => x.orderId === o.id && x.state === "active")) {
          r.state = "released";
          move(d, r.sku, "release", r.qty, "Unpaid order cancelled by customer", o.id, "Customer");
        }
        o.status = "Cancelled";
        o.paymentState = o.paymentState === "pending" ? "cancelled" : o.paymentState;
        o.history.push({ status: "Cancelled", at: now, by: "Customer", note: reason || "Cancelled before payment" });
        return o;
      }
      if (!["Paid", "Processing"].includes(o.status)) fail("This order can no longer be cancelled online. Please contact us.");
      if (o.cancelRequest?.state === "requested") fail("A cancellation request is already open for this order.");
      o.cancelRequest = { reason, at: now, state: "requested" };
      o.history.push({ status: o.status, at: now, by: "Customer", note: `Cancellation requested: ${reason}` });
      return o;
    });
  }
  const deliveredAt = (o) => o.history.find((h) => h.status === "Delivered")?.at || null;
  function returnEligibility(o) {
    if (o.status !== "Delivered") return { ok: false, reason: "Returns open once your order is delivered." };
    const days = (Date.now() - deliveredAt(o)) / DAY;
    if (days > db.settings.returnWindowDays) return { ok: false, reason: `The ${db.settings.returnWindowDays}-day return window has closed.` };
    if (!o.lines.some((l) => l.returnable)) return { ok: false, reason: "The items in this order are not returnable." };
    return { ok: true };
  }
  async function requestReturn(orderId, reason) {
    return tx((d) => {
      const o = d.orders.find((x) => x.id === orderId);
      if (!o) fail("Order not found.");
      const e = returnEligibility(o);
      if (!e.ok) fail(e.reason);
      const now = Date.now();
      o.returnRequest = { reason, at: now, state: "requested", skus: o.lines.filter((l) => l.returnable).map((l) => l.sku) };
      o.status = "Return Requested";
      o.history.push({ status: "Return Requested", at: now, by: "Customer", note: reason });
      return o;
    });
  }

  function reviewEligibility(productId) {
    const me = currentCustomer();
    if (!me) return { ok: false, reason: "signin" };
    if (db.reviews.some((r) => r.productId === productId && r.customerId === me.id)) return { ok: false, reason: "already" };
    const order = db.orders.find((o) => o.customerId === me.id && RECEIVED_STATES.includes(o.status) && o.lines.some((l) => l.productId === productId));
    return order ? { ok: true, orderId: order.id } : { ok: false, reason: "not-verified" };
  }
  async function submitReview({ productId, rating, title, body }) {
    const e = reviewEligibility(productId);
    if (!e.ok) fail(e.reason === "already" ? "You have already reviewed this product." : "Only customers who received this product can review it.");
    rating = Number(rating);
    if (!(rating >= 1 && rating <= 5)) fail("Choose a star rating.");
    if (String(body || "").trim().length < 10) fail("Please write at least a sentence about the product.");
    const me = currentCustomer();
    return tx((d) => {
      const r = {
        id: nextId(d, "review", "rev"),
        productId,
        orderId: e.orderId,
        customerId: me.id,
        name: me.name.split(" ")[0] + (me.name.split(" ")[1] ? ` ${me.name.split(" ")[1][0]}.` : ""),
        rating,
        title: String(title || "").trim().slice(0, 80),
        body: String(body).trim().slice(0, 1200),
        state: "pending",
        reply: "",
        createdAt: Date.now(),
        moderation: [],
      };
      d.reviews.push(r);
      return r;
    });
  }

  async function submitCase({ topic, name, email, orderId, message }) {
    if (!String(name || "").trim()) fail("Please enter your name.");
    if (!validEmail(email)) fail("Please enter a valid email address.");
    if (String(message || "").trim().length < 10) fail("Please tell us a little more (at least 10 characters).");
    return tx((d) => {
      const c = { id: nextId(d, "case", "case"), topic, name: name.trim(), email: email.trim().toLowerCase(), orderId: String(orderId || "").trim().toUpperCase(), message: message.trim(), status: "Open", owner: "", replies: [], createdAt: Date.now() };
      d.cases.push(c);
      return c;
    });
  }

  // Lightweight interaction counters for later merchandising decisions.
  function track(type, productId) {
    try {
      const all = JSON.parse(localStorage.getItem("nirah:analytics") || "{}");
      const row = (all[productId] = all[productId] || { view: 0, add: 0, checkout: 0, purchase: 0 });
      row[type] = (row[type] || 0) + 1;
      localStorage.setItem("nirah:analytics", JSON.stringify(all));
    } catch {
      /* counters are best-effort */
    }
  }

  // ===== Admin =====
  const ROLES = {
    owner: { label: "Owner / Super Admin", perms: ["*"] },
    catalogue: { label: "Catalogue Manager", perms: ["dashboard", "products.view", "products.edit", "products.price", "products.publish", "categories.edit", "inventory.view", "discounts.view", "content.edit", "feedback.view", "reports.view"] },
    inventory: { label: "Inventory Operator", perms: ["dashboard", "products.view", "inventory.view", "inventory.adjust", "orders.view", "reports.view"] },
    fulfilment: { label: "Order Fulfilment", perms: ["dashboard", "products.view", "inventory.view", "orders.view", "orders.update", "customers.view", "refunds.request"] },
    support: { label: "Customer Support", perms: ["dashboard", "products.view", "orders.view", "feedback.view", "feedback.moderate", "customers.view", "refunds.request"] },
    finance: { label: "Finance / Payments", perms: ["dashboard", "orders.view", "payments.view", "refunds.request", "refunds.approve", "discounts.view", "discounts.edit", "reports.view"] },
    analyst: { label: "Read-only Analyst", perms: ["dashboard", "products.view", "inventory.view", "orders.view", "payments.view", "discounts.view", "feedback.view", "reports.view", "audit.view"] },
  };
  const adminSession = (d = db) => d.admins.find((a) => a.id === sessionStorage.getItem(ADMIN_KEY) && a.active) || null;
  const can = (perm, a = adminSession()) => !!a && (ROLES[a.role]?.perms.includes("*") || ROLES[a.role]?.perms.includes(perm));
  const actor = (d, perm) => {
    const a = adminSession(d);
    if (!a) fail("Your session has ended. Please sign in again.");
    if (perm && !can(perm, a)) fail(`Your role (${ROLES[a.role].label}) is not allowed to do this.`);
    return a;
  };
  const audit = (d, a, event, entity, entityId, before, after) =>
    d.audit.unshift({ id: nextId(d, "audit", "aud"), at: Date.now(), userId: a.id, userName: a.name, role: a.role, event, entity, entityId, before, after });
  const diff = (before, after, keys) => {
    const b = {};
    const a = {};
    for (const k of keys) {
      if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
        b[k] = before[k];
        a[k] = after[k];
      }
    }
    return Object.keys(a).length ? [b, a] : null;
  };
  const toInt = (v) => Math.trunc(Number(v));

  const admin = {
    ROLES,
    session: () => adminSession(),
    can,
    async signIn(email, password) {
      email = String(email || "").trim().toLowerCase();
      throttle(`a:${email}`);
      const a = db.admins.find((x) => x.email === email && x.active);
      if (!a || !(await verifyPassword(password, a))) {
        noteFailure(`a:${email}`);
        fail("Email or password is incorrect.");
      }
      sessionStorage.setItem(ADMIN_KEY, a.id);
      await tx((d) => audit(d, a, "admin.sign-in", "admin", a.id, null, null));
      return a;
    },
    signOut() {
      sessionStorage.removeItem(ADMIN_KEY);
      emit("auth");
    },

    // --- Products ---
    async saveProduct(input) {
      return tx((d) => {
        const a = actor(d, "products.edit");
        const existing = input.id ? productById(input.id, d) : null;
        const sku = String(input.sku || "").trim().toUpperCase();
        const title = String(input.title || "").trim();
        if (!sku) fail("SKU is required.");
        if (!title) fail("Product name is required.");
        if (d.products.some((p) => p.sku === sku && p.id !== input.id)) fail(`SKU ${sku} is already used by another product.`);
        if (!catById(input.categoryId, d)) fail("Choose a category.");
        const price = Number(input.price);
        if (!(price > 0)) fail("Regular price must be greater than zero.");
        const minPrice = input.minPrice === "" || input.minPrice == null ? null : Number(input.minPrice);
        if (minPrice != null && (minPrice < 0 || minPrice > price)) fail("Minimum selling price must be between 0 and the regular price.");
        const maxPerOrder = toInt(input.maxPerOrder);
        if (!(maxPerOrder >= 1)) fail("Maximum order quantity must be at least 1.");
        let slug = N.ui.slugify(input.slug || title);
        if (d.products.some((p) => p.slug === slug && p.id !== input.id)) slug = `${slug}-${sku.toLowerCase()}`;
        const fields = {
          sku,
          title,
          slug,
          categoryId: input.categoryId,
          brand: String(input.brand || "").trim(),
          short: String(input.short || "").trim(),
          description: String(input.description || "").trim(),
          images: (input.images || []).filter((i) => i.src),
          specs: (input.specs || []).filter(([k, v]) => k && v),
          material: input.material || "",
          dimensions: input.dimensions || "",
          color: input.color || "",
          weight: input.weight || "",
          care: input.care || "",
          price,
          minPrice,
          taxClass: input.taxClass || "standard",
          maxPerOrder,
          returnable: !!input.returnable,
          noPromo: !!input.noPromo,
          tags: (input.tags || []).filter(Boolean),
          keywords: input.keywords || "",
          seoTitle: input.seoTitle || "",
          seoDescription: input.seoDescription || "",
          featuredRank: toInt(input.featuredRank) || 0,
          bestPin: toInt(input.bestPin) || 0,
          quality: { ...(existing?.quality || {}), ...(input.quality || {}) },
          updatedAt: Date.now(),
        };
        if (existing) {
          const priceChange = diff(existing, fields, ["price", "minPrice"]);
          if (priceChange && !can("products.price", a)) fail("Your role is not allowed to change prices.");
          if (priceChange) audit(d, a, "product.price", "product", existing.id, ...priceChange);
          const other = diff(existing, fields, ["sku", "title", "categoryId", "description", "specs", "material", "dimensions", "color", "weight", "care", "taxClass", "maxPerOrder", "returnable", "images"]);
          if (other) audit(d, a, "product.update", "product", existing.id, ...other);
          if (existing.sku !== sku) {
            d.inventory[sku] = d.inventory[existing.sku];
            delete d.inventory[existing.sku];
          }
          Object.assign(existing, fields);
          return existing;
        }
        const p = { id: uid("p"), ...fields, status: "draft", createdAt: Date.now(), publishedAt: null };
        d.products.push(p);
        d.inventory[sku] = { onHand: 0, quarantine: 0, committed: 0, reorder: d.settings.lowStockDefault, lastReceipt: null };
        audit(d, a, "product.create", "product", p.id, null, { sku, title, price });
        return p;
      });
    },
    async duplicateProduct(id) {
      const src = productById(id);
      let n = 2;
      while (db.products.some((p) => p.sku === `${src.sku}-${n}`)) n += 1;
      return admin.saveProduct({ ...JSON.parse(JSON.stringify(src)), id: null, sku: `${src.sku}-${n}`, title: `${src.title} (copy)`, slug: "", quality: { sourcing: false, inspection: false, listing: false, approved: false, notes: "" } });
    },
    async setProductStatus(id, action) {
      return tx((d) => {
        const p = productById(id, d);
        if (!p) fail("Product not found.");
        const a = actor(d, action === "approve" || action === "publish" ? "products.publish" : "products.edit");
        const before = p.status;
        const q = p.quality || {};
        if (action === "submit") {
          if (!["draft", "unpublished"].includes(p.status)) fail("Only drafts can be submitted for approval.");
          if (!p.images.length) fail("Add at least one image before submitting.");
          if (!(q.sourcing && q.inspection && q.listing)) fail("Complete the sourcing, inspection and listing checks first.");
          p.status = "pending";
        } else if (action === "approve") {
          if (p.status !== "pending") fail("Only products awaiting approval can be approved.");
          p.status = "published";
          p.quality = { ...q, approved: true, approvedBy: a.name, approvedAt: Date.now() };
          p.publishedAt = p.publishedAt || Date.now();
        } else if (action === "reject") {
          if (p.status !== "pending") fail("Only products awaiting approval can be sent back.");
          p.status = "draft";
        } else if (action === "publish") {
          if (!q.approved) fail("This product has not been approved yet.");
          p.status = "published";
          p.publishedAt = p.publishedAt || Date.now();
        } else if (action === "unpublish") {
          p.status = "unpublished";
        } else if (action === "archive") {
          p.status = "archived";
        } else if (action === "restore") {
          p.status = "draft";
          p.quality = { ...q, approved: false };
        } else fail("Unknown action.");
        audit(d, a, `product.${action}`, "product", p.id, { status: before }, { status: p.status });
        return p;
      });
    },

    // --- Categories ---
    async saveCategory(input) {
      return tx((d) => {
        const a = actor(d, "categories.edit");
        const name = String(input.name || "").trim();
        const slug = N.ui.slugify(input.slug || name);
        if (!name) fail("Category name is required.");
        if (d.categories.some((c) => c.id !== input.id && c.name.toLowerCase() === name.toLowerCase())) fail("Another category already has this name.");
        if (d.categories.some((c) => c.id !== input.id && c.slug === slug)) fail("Another category already uses this URL slug.");
        const parentId = input.parentId || null;
        if (parentId && input.id && descendants(input.id, d).includes(parentId)) fail("A category cannot be placed inside itself or one of its subcategories.");
        const fields = { name, slug, parentId, description: String(input.description || "").trim(), image: input.image || "", order: toInt(input.order) || 0, seoTitle: input.seoTitle || "", seoDescription: input.seoDescription || "" };
        const existing = input.id ? catById(input.id, d) : null;
        if (existing) {
          const change = diff(existing, fields, Object.keys(fields));
          Object.assign(existing, fields);
          if (change) audit(d, a, "category.update", "category", existing.id, ...change);
          return existing;
        }
        const c = { id: uid("cat"), ...fields, active: false, archived: false };
        d.categories.push(c);
        audit(d, a, "category.create", "category", c.id, null, { name, slug });
        return c;
      });
    },
    async setCategoryActive(id, active, { strategy, targetId } = {}) {
      return tx((d) => {
        const a = actor(d, "categories.edit");
        const c = catById(id, d);
        if (!active) {
          const cats = descendants(id, d);
          const live = d.products.filter((p) => cats.includes(p.categoryId) && p.status === "published");
          if (live.length && !strategy) fail(`${live.length} published product(s) are in this category. Move them or hide them first.`);
          if (strategy === "move") {
            if (!catById(targetId, d) || cats.includes(targetId)) fail("Choose a different, active category to move products into.");
            live.forEach((p) => (p.categoryId = targetId));
          }
          if (strategy === "hide") live.forEach((p) => (p.status = "unpublished"));
        }
        c.active = !!active;
        audit(d, a, active ? "category.activate" : "category.deactivate", "category", id, null, { strategy: strategy || null, targetId: targetId || null });
        return c;
      });
    },
    async archiveCategory(id) {
      return tx((d) => {
        const a = actor(d, "categories.edit");
        const c = catById(id, d);
        if (d.categories.some((x) => x.parentId === id && !x.archived)) fail("Archive or move its subcategories first.");
        const count = d.products.filter((p) => p.categoryId === id && p.status !== "archived").length;
        if (count) fail(`This category still has ${count} product(s). Move them before archiving.`);
        c.archived = true;
        c.active = false;
        audit(d, a, "category.archive", "category", id, null, null);
        return c;
      });
    },
    async moveProducts(productIds, targetId) {
      return tx((d) => {
        const a = actor(d, "categories.edit");
        if (!catById(targetId, d)) fail("Choose a category.");
        for (const id of productIds) {
          const p = productById(id, d);
          if (p) {
            audit(d, a, "product.move", "product", id, { categoryId: p.categoryId }, { categoryId: targetId });
            p.categoryId = targetId;
          }
        }
        return productIds.length;
      });
    },

    // --- Inventory ---
    async receiveStock(sku, qty, { ref, qcPassed, note }) {
      return tx((d) => {
        const a = actor(d, "inventory.adjust");
        qty = toInt(qty);
        if (!(qty > 0)) fail("Quantity must be a whole number above zero.");
        if (!String(ref || "").trim()) fail("Add a reference such as the goods receipt number.");
        const inv = d.inventory[sku];
        const before = { onHand: inv.onHand, quarantine: inv.quarantine };
        if (qcPassed) inv.onHand += qty;
        else inv.quarantine += qty;
        inv.lastReceipt = Date.now();
        move(d, sku, qcPassed ? "receipt" : "receipt-quarantine", qty, note || (qcPassed ? "Received, QC passed" : "Received, awaiting inspection"), ref, a.name);
        audit(d, a, "stock.receive", "inventory", sku, before, { onHand: inv.onHand, quarantine: inv.quarantine });
        return inv;
      });
    },
    async adjustStock(sku, delta, { reason, ref }) {
      return tx((d) => {
        const a = actor(d, "inventory.adjust");
        delta = toInt(delta);
        if (!delta) fail("Enter a quantity to add or remove.");
        if (!String(reason || "").trim()) fail("A reason is required for every stock adjustment.");
        const inv = d.inventory[sku];
        const st = stockOf(sku, d);
        if (delta < 0 && -delta > st.available) fail(`Cannot remove ${-delta}: only ${st.available} are available (${st.reserved} held for checkout, ${inv.committed} allocated to paid orders).`);
        const before = { onHand: inv.onHand };
        inv.onHand += delta;
        move(d, sku, "adjustment", delta, reason, ref || "", a.name);
        audit(d, a, "stock.adjust", "inventory", sku, before, { onHand: inv.onHand, reason });
        return inv;
      });
    },
    async inspectQuarantine(sku, qty, decision, note) {
      return tx((d) => {
        const a = actor(d, "inventory.adjust");
        qty = toInt(qty);
        const inv = d.inventory[sku];
        if (!(qty > 0) || qty > inv.quarantine) fail(`Enter between 1 and ${inv.quarantine}.`);
        const before = { onHand: inv.onHand, quarantine: inv.quarantine };
        inv.quarantine -= qty;
        if (decision === "approve") inv.onHand += qty;
        move(d, sku, decision === "approve" ? "inspect-approve" : "write-off", decision === "approve" ? qty : -qty, note || (decision === "approve" ? "Inspected and approved for sale" : "Written off after inspection"), "", a.name);
        audit(d, a, `stock.${decision === "approve" ? "inspect-approve" : "write-off"}`, "inventory", sku, before, { onHand: inv.onHand, quarantine: inv.quarantine });
        return inv;
      });
    },
    async setReorder(sku, value) {
      return tx((d) => {
        const a = actor(d, "inventory.adjust");
        const v = toInt(value);
        if (!(v >= 0)) fail("Threshold cannot be negative.");
        audit(d, a, "stock.threshold", "inventory", sku, { reorder: d.inventory[sku].reorder }, { reorder: v });
        d.inventory[sku].reorder = v;
      });
    },
    sweep: () => tx(() => true),

    // --- Orders ---
    async advanceOrder(id, next, { courier, trackingId, note } = {}) {
      return tx((d) => {
        const a = actor(d, "orders.update");
        const o = d.orders.find((x) => x.id === id);
        const flow = { Paid: "Processing", Processing: "Packed", Packed: "Shipped", Shipped: "Delivered", "Return Requested": "Returned" };
        if (flow[o.status] !== next) fail(`An order that is ${o.status} cannot move to ${next}.`);
        if (o.paymentState !== "paid") fail("Payment has not been verified. Orders are never dispatched before payment is confirmed.");
        if (o.exception && next === "Shipped") fail(`Resolve the exception first: ${o.exception}`);
        if (next === "Shipped") {
          if (!String(courier || "").trim() || !String(trackingId || "").trim()) fail("Enter the courier and tracking ID.");
          o.courier = courier.trim();
          o.trackingId = trackingId.trim();
          for (const l of o.lines) {
            const inv = d.inventory[l.sku];
            inv.onHand -= l.qty;
            inv.committed = Math.max(0, inv.committed - l.qty);
            move(d, l.sku, "ship", -l.qty, "Dispatched", o.id, a.name);
          }
        }
        if (next === "Returned") {
          for (const l of o.lines.filter((x) => o.returnRequest?.skus?.includes(x.sku) ?? x.returnable)) {
            d.inventory[l.sku].quarantine += l.qty;
            move(d, l.sku, "return", l.qty, "Customer return received; awaiting inspection", o.id, a.name);
          }
          const amount = round2(o.lines.filter((l) => o.returnRequest?.skus?.includes(l.sku)).reduce((s, l) => s + l.unit * l.qty - (l.couponShare || 0), 0));
          d.refunds.push({ id: nextId(d, "refund", "ref"), orderId: o.id, paymentId: d.payments.find((p) => p.orderId === o.id && p.state === "captured")?.id, amount, reason: `Return: ${o.returnRequest?.reason || ""}`, state: "requested", requestedBy: a.name, createdAt: Date.now() });
          o.returnRequest = { ...o.returnRequest, state: "received" };
        }
        const before = o.status;
        o.status = next;
        o.history.push({ status: next, at: Date.now(), by: a.name, note: note || (next === "Shipped" ? `${o.courier} · ${o.trackingId}` : "") });
        o.notifications = [...(o.notifications || []), { channel: "email", to: o.email, template: `Order ${next.toLowerCase()}`, at: Date.now() }];
        audit(d, a, "order.status", "order", o.id, { status: before }, { status: next });
        return o;
      });
    },
    async cancelOrder(id, reason) {
      return tx((d) => {
        const a = actor(d, "orders.update");
        const o = d.orders.find((x) => x.id === id);
        if (!["Placed", "Paid", "Processing", "Packed"].includes(o.status)) fail("Only orders that have not shipped can be cancelled.");
        if (!String(reason || "").trim()) fail("Give a reason for the cancellation.");
        const before = o.status;
        if (o.paymentState === "paid") {
          for (const l of o.lines) {
            d.inventory[l.sku].committed = Math.max(0, d.inventory[l.sku].committed - l.qty);
            move(d, l.sku, "release", l.qty, "Paid order cancelled before dispatch", o.id, a.name);
          }
          d.refunds.push({ id: nextId(d, "refund", "ref"), orderId: o.id, paymentId: d.payments.find((p) => p.orderId === o.id && p.state === "captured")?.id, amount: o.total, reason: `Cancelled: ${reason}`, state: "requested", requestedBy: a.name, createdAt: Date.now() });
        } else {
          for (const r of d.reservations.filter((x) => x.orderId === o.id && x.state === "active")) {
            r.state = "released";
            move(d, r.sku, "release", r.qty, "Unpaid order cancelled", o.id, a.name);
          }
        }
        if (o.cancelRequest) o.cancelRequest.state = "approved";
        o.status = "Cancelled";
        o.history.push({ status: "Cancelled", at: Date.now(), by: a.name, note: reason });
        audit(d, a, "order.cancel", "order", o.id, { status: before }, { status: "Cancelled", reason });
        return o;
      });
    },
    async declineRequest(id, kind, note) {
      return tx((d) => {
        const a = actor(d, "orders.update");
        const o = d.orders.find((x) => x.id === id);
        if (kind === "cancel" && o.cancelRequest) o.cancelRequest.state = "declined";
        if (kind === "return" && o.returnRequest) {
          o.returnRequest.state = "declined";
          o.status = "Delivered";
        }
        o.history.push({ status: o.status, at: Date.now(), by: a.name, note: `${kind === "cancel" ? "Cancellation" : "Return"} request declined: ${note}` });
        audit(d, a, `order.${kind}-declined`, "order", o.id, null, { note });
      });
    },
    async addNote(id, text) {
      return tx((d) => {
        const a = actor(d, "orders.view");
        const o = d.orders.find((x) => x.id === id);
        o.notes.push({ by: a.name, at: Date.now(), text: String(text).trim() });
      });
    },

    // --- Payments and refunds ---
    async requestRefund(orderId, amount, reason) {
      return tx((d) => {
        const a = actor(d, "refunds.request");
        const o = d.orders.find((x) => x.id === orderId);
        amount = round2(Number(amount));
        const refunded = d.refunds.filter((r) => r.orderId === orderId && r.state !== "rejected").reduce((s, r) => s + r.amount, 0);
        if (!(amount > 0) || amount > o.total - refunded) fail(`Refund must be between ₹1 and ${money(o.total - refunded)}.`);
        const r = { id: nextId(d, "refund", "ref"), orderId, paymentId: d.payments.find((p) => p.orderId === orderId && p.state === "captured")?.id, amount, reason, state: "requested", requestedBy: a.name, createdAt: Date.now() };
        d.refunds.push(r);
        audit(d, a, "refund.request", "refund", r.id, null, { amount, orderId });
        return r;
      });
    },
    async decideRefund(id, decision) {
      return tx((d) => {
        const a = actor(d, "refunds.approve");
        const r = d.refunds.find((x) => x.id === id);
        const before = r.state;
        if (decision === "approve" && r.state === "requested") r.state = "approved";
        else if (decision === "reject" && r.state === "requested") r.state = "rejected";
        else if (decision === "process" && r.state === "approved") {
          // Refund API call to the gateway (simulated), then reconcile.
          r.state = "processed";
          r.processedAt = Date.now();
          r.gatewayRef = `sbx_rfnd_${Math.random().toString(36).slice(2, 10)}`;
          r.approvedBy = a.name;
          const o = d.orders.find((x) => x.id === r.orderId);
          const total = d.refunds.filter((x) => x.orderId === o.id && x.state === "processed").reduce((s, x) => s + x.amount, 0);
          const pay = d.payments.find((p) => p.id === r.paymentId);
          if (pay) pay.state = total >= pay.amount ? "refunded" : "partially refunded";
          if (total >= o.merchandise - 0.5) o.paymentState = "refunded";
          if (o.status === "Returned") {
            o.status = "Refunded";
            o.returnRequest = { ...o.returnRequest, state: "completed" };
          }
          o.history.push({ status: o.status, at: Date.now(), by: a.name, note: `Refund of ${money(r.amount)} processed (${r.gatewayRef})` });
        } else fail(`A ${r.state} refund cannot be ${decision}d.`);
        audit(d, a, `refund.${decision}`, "refund", r.id, { state: before }, { state: r.state, amount: r.amount });
        return r;
      });
    },
    async resolveException(orderId, note) {
      return tx((d) => {
        const a = actor(d, "payments.view");
        const o = d.orders.find((x) => x.id === orderId);
        o.history.push({ status: o.status, at: Date.now(), by: a.name, note: `Exception resolved: ${note}` });
        audit(d, a, "payment.exception-resolved", "order", o.id, { exception: o.exception }, { note });
        delete o.exception;
        if (o.paymentState === "review") o.paymentState = "pending";
      });
    },

    // --- Promotions ---
    validatePromotion(input) {
      const errors = [];
      const value = Number(input.value);
      if (!String(input.name || "").trim()) errors.push("Give the promotion a name.");
      if (!(value >= 0)) errors.push("Discount cannot be negative.");
      if (input.mode === "percent" && !(value > 0 && value <= 100)) errors.push("Percentage must be between 0 and 100.");
      if (!(input.startsAt < input.endsAt)) errors.push("Start must be before end.");
      if (input.type === "product" && !input.skus?.length) errors.push("Choose at least one product.");
      if (input.type === "category" && !input.categoryIds?.length) errors.push("Choose at least one category.");
      if (input.type === "campaign" && !input.skus?.length && !input.categoryIds?.length) errors.push("Choose eligible products or categories.");
      if (input.type === "coupon") {
        if (!/^[A-Z0-9]{4,16}$/.test(String(input.code || ""))) errors.push("Coupon codes use 4–16 letters or numbers.");
        if (db.promotions.some((p) => p.code === input.code && p.id !== input.id)) errors.push("That code is already in use.");
      }
      return errors;
    },
    previewPromotion(input) {
      const draft = { ...input, id: input.id || "preview", value: Number(input.value) || 0, usageLimit: 0, active: true, startsAt: Date.now() - 1, endsAt: Date.now() + DAY, used: 0, archived: false };
      return db.products
        .filter((p) => p.status !== "archived" && promoApplies(draft, p))
        .map((p) => {
          const now = pricing(p);
          const raw = roundPrice(promoPrice(draft, p.price), db);
          const withPromo = draft.type === "coupon" ? null : pricing(p, db, Date.now(), draft);
          return { p, current: now.price, raw, effective: withPromo ? withPromo.price : raw, floored: !draft.allowBelowFloor && raw < now.floor, wins: withPromo?.promo?.id === draft.id };
        });
    },
    async savePromotion(input) {
      const errors = admin.validatePromotion(input);
      if (errors.length) fail(errors.join(" "));
      return tx((d) => {
        const a = actor(d, "discounts.edit");
        if (input.allowBelowFloor && a.role !== "owner") fail("Only the owner can allow prices below the floor.");
        const fields = {
          name: input.name.trim(),
          type: input.type,
          mode: input.mode,
          value: Number(input.value),
          skus: input.skus || [],
          categoryIds: input.categoryIds || [],
          excludeSkus: input.excludeSkus || [],
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          active: !!input.active,
          code: input.type === "coupon" ? input.code : undefined,
          minSpend: Number(input.minSpend) || 0,
          usageLimit: toInt(input.usageLimit) || 0,
          perCustomerLimit: toInt(input.perCustomerLimit) || 0,
          banner: input.banner || "",
          image: input.image || "",
          public: !!input.public,
          allowBelowFloor: !!input.allowBelowFloor,
        };
        const existing = d.promotions.find((p) => p.id === input.id);
        if (existing) {
          const change = diff(existing, fields, Object.keys(fields));
          Object.assign(existing, fields);
          if (change) audit(d, a, "promotion.update", "promotion", existing.id, ...change);
          return existing;
        }
        const p = { id: uid("promo"), ...fields, used: 0, archived: false, createdBy: a.name };
        d.promotions.push(p);
        audit(d, a, "promotion.create", "promotion", p.id, null, fields);
        return p;
      });
    },
    async setPromotionFlag(id, flag, value) {
      return tx((d) => {
        const a = actor(d, "discounts.edit");
        const p = d.promotions.find((x) => x.id === id);
        audit(d, a, `promotion.${flag}`, "promotion", id, { [flag]: p[flag] }, { [flag]: value });
        p[flag] = value;
      });
    },

    // --- Feedback ---
    async moderateReview(id, action, reason) {
      return tx((d) => {
        const a = actor(d, "feedback.moderate");
        const r = d.reviews.find((x) => x.id === id);
        if (action === "reject" && !String(reason || "").trim()) fail("Record the policy reason for rejecting a review.");
        const before = r.state;
        r.state = action === "approve" ? "approved" : "rejected";
        r.moderation.push({ action: r.state, by: a.name, at: Date.now(), reason: reason || "" });
        audit(d, a, `review.${r.state}`, "review", id, { state: before }, { state: r.state, reason: reason || "" });
      });
    },
    async replyReview(id, text) {
      return tx((d) => {
        const a = actor(d, "feedback.moderate");
        const r = d.reviews.find((x) => x.id === id);
        r.reply = String(text || "").trim();
        r.moderation.push({ action: "replied", by: a.name, at: Date.now(), reason: "" });
      });
    },
    async updateCase(id, patch) {
      return tx((d) => {
        const a = actor(d, "feedback.moderate");
        const c = d.cases.find((x) => x.id === id);
        if (patch.status) c.status = patch.status;
        if (patch.owner !== undefined) c.owner = patch.owner;
        if (patch.topic) c.topic = patch.topic;
        if (patch.reply) c.replies.push({ by: a.name, at: Date.now(), text: patch.reply.trim() });
        c.history = [...(c.history || []), { by: a.name, at: Date.now(), change: JSON.stringify(patch) }];
        return c;
      });
    },

    // --- Content ---
    async saveContentDraft(draft) {
      return tx((d) => {
        actor(d, "content.edit");
        d.content.draft = draft;
        d.content.draftSavedAt = Date.now();
      });
    },
    async publishContent() {
      return tx((d) => {
        const a = actor(d, "content.edit");
        d.content.published = JSON.parse(JSON.stringify(d.content.draft));
        d.content.publishedAt = Date.now();
        audit(d, a, "content.publish", "content", "site", null, { sections: d.content.published.sections.map((s) => s.key) });
      });
    },
    async discardContentDraft() {
      return tx((d) => {
        actor(d, "content.edit");
        d.content.draft = JSON.parse(JSON.stringify(d.content.published));
      });
    },

    // --- Settings and users ---
    async saveSettings(patch) {
      return tx((d) => {
        const a = actor(d, "settings.edit");
        const change = diff(d.settings, { ...d.settings, ...patch }, Object.keys(patch));
        Object.assign(d.settings, patch);
        if (change) audit(d, a, "settings.update", "settings", "site", ...change);
      });
    },
    async saveAdmin(input) {
      const rec = input.password ? await hashPassword(input.password) : null;
      return tx((d) => {
        const a = actor(d, "users.manage");
        const email = String(input.email || "").trim().toLowerCase();
        if (!String(input.name || "").trim() || !validEmail(email)) fail("Enter a name and a valid email.");
        if (!ROLES[input.role]) fail("Choose a role.");
        if (d.admins.some((x) => x.email === email && x.id !== input.id)) fail("Another user has this email.");
        const existing = d.admins.find((x) => x.id === input.id);
        const owners = d.admins.filter((x) => x.role === "owner" && x.active && x.id !== input.id);
        if (existing?.role === "owner" && (input.role !== "owner" || !input.active) && !owners.length) fail("Keep at least one active owner.");
        if (existing) {
          audit(d, a, "user.update", "admin", existing.id, { role: existing.role, active: existing.active }, { role: input.role, active: !!input.active });
          Object.assign(existing, { name: input.name.trim(), email, role: input.role, active: !!input.active }, rec || {});
          return existing;
        }
        if (!rec) fail("Set a temporary password for the new user.");
        const u = { id: uid("adm"), name: input.name.trim(), email, role: input.role, active: true, ...rec };
        d.admins.push(u);
        audit(d, a, "user.create", "admin", u.id, null, { email, role: u.role });
        return u;
      });
    },
    async replayWebhook(eventId) {
      actor(db, "payments.view");
      return N.gateway.redeliver(eventId);
    },
  };

  // ----- Boot -----
  async function init() {
    db = load();
    if (!db || db.version !== 1) {
      db = await N.seed({ hash: hashPassword, taxOf: (d, p) => taxRate(d, p) });
      save(db);
    }
    window.addEventListener("storage", (e) => {
      if (e.key === KEY && e.newValue) {
        db = load();
        emit("external");
      }
      if (e.key === CART_KEY) emit("cart");
      if (e.key === CUSTOMER_KEY) emit("auth");
    });
    setInterval(() => {
      const now = Date.now();
      if (db.reservations.some((r) => r.state === "active" && r.expiresAt <= now)) tx(() => true);
    }, 15000);
    return db;
  }

  async function reset() {
    [KEY, CART_KEY, CUSTOMER_KEY, "nirah:gateway", "nirah:analytics"].forEach((k) => localStorage.removeItem(k));
    sessionStorage.clear();
    location.reload();
  }

  N.store = {
    ready: init(),
    get db() {
      return db;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    Fail,
    reset,
    // catalogue
    catById,
    categoryChain,
    catVisible,
    descendants,
    isPublic,
    publicProducts,
    productBySku,
    productById,
    productBySlug,
    stockOf,
    pricing,
    promoState,
    promoApplies,
    taxRate,
    search,
    listing,
    unitsSold,
    bestSellers,
    newArrivals,
    isNew,
    approvedReviews,
    ratingSummary,
    shippingQuote,
    content: (preview = false) => (preview ? db.content.draft : db.content.published),
    // shopping
    cart,
    quote,
    placeOrder,
    retryPayment,
    handleWebhook,
    validateCheckout,
    // customers
    currentCustomer,
    register,
    signIn,
    signOut,
    updateCustomer,
    orderFor,
    lookupOrder,
    ordersForCustomer,
    requestCancel,
    requestReturn,
    returnEligibility,
    deliveredAt,
    reviewEligibility,
    submitReview,
    submitCase,
    track,
    hmac,
    admin,
    OPEN_STATES,
  };
})();
