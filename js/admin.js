// NIRAH admin console. Every action goes through store.admin, which checks the
// signed-in user's role and writes the audit log; the UI only hides what a
// role can't use.
(() => {
  const N = window.Nirah;
  const S = N.store;
  const A = S.admin;
  const { esc, money, num, icon, imgUrl, fmtDate, fmtDateTime, dayKey, toLocalInput, stars, toast, openSheet, confirmDialog, csv, printDocument, logoMark, round2 } = N.ui;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const root = $("#admin");
  const DAY = 86400000;
  const db = () => S.db;

  const NAV = [
    ["dashboard", "Dashboard", "grid", "dashboard"],
    ["products", "Products", "tag", "products.view"],
    ["categories", "Categories", "layers", ["categories.edit", "products.view"]],
    ["inventory", "Inventory", "box", "inventory.view"],
    ["orders", "Orders", "cart", "orders.view"],
    ["payments", "Payments & Refunds", "wallet", ["payments.view", "refunds.request"]],
    ["discounts", "Discounts & Campaigns", "percent", "discounts.view"],
    ["feedback", "Customer Feedback", "chat", "feedback.view"],
    ["customers", "Customers", "users", "customers.view"],
    ["content", "Website Content", "page", "content.edit"],
    ["reports", "Reports", "chart", "reports.view"],
    ["settings", "Settings", "settings", "settings.edit"],
    ["users", "Users & Audit Log", "log", ["users.manage", "audit.view"]],
  ];
  const allowed = (perm) => (Array.isArray(perm) ? perm.some((p) => A.can(p)) : A.can(perm));

  // ---------- Helpers ----------
  const sum = (arr) => round2(arr.reduce((s, v) => s + (Number(v) || 0), 0));
  const chip = (text, tone = "") => `<span class="status ${tone ? `status--${tone}` : ""}">${esc(text)}</span>`;
  const productTone = { published: "ok", pending: "warn", draft: "info", unpublished: "bad", archived: "" };
  const orderTone = (s) => ({ Delivered: "ok", Paid: "ok", Processing: "info", Packed: "info", Shipped: "info", Placed: "warn", Cancelled: "bad", "Return Requested": "warn", Returned: "warn", Refunded: "" })[s] || "";
  const payTone = (s) => ({ paid: "ok", captured: "ok", pending: "warn", processing: "warn", failed: "bad", expired: "bad", review: "bad", mismatch: "bad", refunded: "", superseded: "" })[s] || "";
  const promoTone = { active: "ok", scheduled: "info", expired: "", inactive: "bad", exhausted: "warn", archived: "" };
  const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== "" && v != null)).toString();
  const startOfToday = () => new Date(`${dayKey(Date.now())}T00:00:00+05:30`).getTime();
  const sinceFor = (range) => (range === "today" ? startOfToday() : Date.now() - Number(range || 30) * DAY);
  const isPaidSale = (o) => o.paymentState === "paid" && o.status !== "Cancelled";
  const productCell = (p, sub = "") =>
    `<span class="cell-product"><img src="${imgUrl(p?.images?.[0], 88)}" alt="" loading="lazy"><span><strong>${esc(p?.title || "Unknown")}</strong><small>${esc(sub || p?.sku || "")}</small></span></span>`;
  const table = (head, rows, empty = "Nothing to show.") =>
    rows.length
      ? `<div class="table-wrap"><table class="t"><thead><tr>${head.map((h) => `<th class="${h.startsWith(">") ? "r" : ""}">${esc(h.replace(/^>/, ""))}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`
      : `<p class="muted" style="padding:18px 20px">${esc(empty)}</p>`;
  const catOptions = (selected, { none = false, exclude = [] } = {}) => {
    const out = [];
    const walk = (parentId, depth) =>
      db()
        .categories.filter((c) => (c.parentId || null) === parentId && !c.archived && !exclude.includes(c.id))
        .sort((a, b) => a.order - b.order)
        .forEach((c) => {
          out.push(`<option value="${c.id}" ${c.id === selected ? "selected" : ""}>${"— ".repeat(depth)}${esc(c.name)}${c.active ? "" : " (hidden)"}</option>`);
          walk(c.id, depth + 1);
        });
    walk(null, 0);
    return `${none ? `<option value="">— None (top level) —</option>` : ""}${out.join("")}`;
  };
  async function act(fn, ok) {
    try {
      const r = await fn();
      if (ok) toast(ok);
      return r ?? true;
    } catch (err) {
      toast(err.message || String(err), "error");
      return null;
    }
  }
  const gatewayState = (o) => {
    const pay = db().payments.filter((p) => p.orderId === o.id).sort((a, b) => b.createdAt - a.createdAt)[0];
    return pay?.sessionId ? N.gateway.session(pay.sessionId)?.state : null;
  };
  const exceptions = () =>
    db().orders.filter(
      (o) => o.exception || o.paymentState === "review" || (o.paymentState === "pending" && ["captured", "processing"].includes(gatewayState(o)) && Date.now() - o.createdAt > 15 * 60000)
    );

  // ---------- Routing ----------
  function parseHash() {
    const raw = location.hash.slice(1) || "/dashboard";
    const [path, query] = raw.split("?");
    const [section = "dashboard", ...rest] = path.split("/").filter(Boolean);
    return { section, rest, query: Object.fromEntries(new URLSearchParams(query || "")) };
  }
  const views = {};
  let current = null;
  let editing = false;

  function render({ keepScroll = false } = {}) {
    const a = A.session();
    if (!a) return renderLogin();
    if (!$(".shell", root)) renderShell(a);
    const { section, rest, query } = parseHash();
    const entry = NAV.find(([k]) => k === section);
    const y = window.scrollY;
    editing = false;
    if (!entry || !allowed(entry[3])) {
      current = { title: "Not available", html: `<div class="denied">${icon("lock")}<h2>Your role can't open this page</h2><p>${esc(A.ROLES[a.role].label)} accounts don't have access to ${esc(entry?.[1] || "this section")}.</p><a class="btn btn--ghost" href="#/dashboard">Go to dashboard</a></div>` };
    } else {
      current = views[section](rest, query) || {};
    }
    $("[data-title]", root).textContent = current.title || "";
    document.title = `${current.title || "Admin"} · NIRAH Admin`;
    const content = $("[data-content]", root);
    content.innerHTML = current.html || "";
    current.mount?.(content);
    $$("[data-nav]", root).forEach((el) => (el.dataset.nav === section ? el.setAttribute("aria-current", "page") : el.removeAttribute("aria-current")));
    $("[data-side]", root)?.classList.remove("is-open");
    if (keepScroll) window.scrollTo(0, y);
    else window.scrollTo(0, 0);
    paintBadges();
  }

  function renderLogin() {
    root.innerHTML = `<div class="login"><form class="login__card" data-login>
      <div class="login__brand">${logoMark()}<span class="brand__name">NIRAH</span><span class="muted" style="margin-left:auto">Admin</span></div>
      <div><h1 style="font-size:24px;font-weight:500">Sign in</h1><p class="muted" style="margin-top:4px">Administration console for staff.</p></div>
      <label class="field"><span class="field__label">Email</span><input name="email" type="email" autocomplete="username" required></label>
      <label class="field"><span class="field__label">Password</span><input name="password" type="password" autocomplete="current-password" required></label>
      <p class="field__error" data-error role="alert"></p>
      <button class="btn btn--primary btn--lg" type="submit">Sign in</button>
      <div><p class="field__hint" style="margin-bottom:8px">Demo accounts (password <strong>demo1234</strong>). Each role sees only what it is allowed to do:</p>
      <div class="demo-accounts">${db().admins.filter((x) => x.active).map((x) => `<button type="button" data-demo="${esc(x.email)}"><strong>${esc(A.ROLES[x.role].label)}</strong><span>${esc(x.email)}</span></button>`).join("")}</div></div>
      <p class="field__hint">${icon("info")} Production would add multi-factor authentication and server-side sessions; this browser prototype can't.</p>
    </form></div>`;
    $$("[data-demo]", root).forEach((b) =>
      b.addEventListener("click", () => {
        $("[name=email]", root).value = b.dataset.demo;
        $("[name=password]", root).value = "demo1234";
        $("[name=password]", root).focus();
      })
    );
    $("[data-login]", root).addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await A.signIn(e.target.email.value, e.target.password.value);
        if (!location.hash) location.hash = "#/dashboard";
        root.innerHTML = "";
        render();
      } catch (err) {
        $("[data-error]", root).textContent = err.message;
      }
    });
  }

  function renderShell(a) {
    root.innerHTML = `<div class="shell">
      <aside class="side" data-side>
        <a class="brand" href="#/dashboard">${logoMark()}<span class="brand__name">NIRAH</span></a>
        <p class="side__role">${esc(A.ROLES[a.role].label)}</p>
        <nav aria-label="Admin sections">${NAV.filter(([, , , perm]) => allowed(perm)).map(([k, label, ic]) => `<a href="#/${k}" data-nav="${k}">${icon(ic)}<span>${label}</span><span data-badge="${k}"></span></a>`).join("")}</nav>
        <div class="side__foot">
          <a href="index.html" target="_blank" rel="noopener">${icon("home")} View store</a>
          <button type="button" data-signout>${icon("logout")} Sign out</button>
        </div>
      </aside>
      <div class="workspace">
        <header class="topbar"><div style="display:flex;align-items:center;gap:10px"><button class="icon-btn-sm menu-btn" type="button" data-menu aria-label="Open navigation">${icon("menu")}</button><h1 data-title></h1></div>
          <div class="topbar__right"><span class="who"><span class="who__avatar">${esc(a.name[0])}</span><span class="who__name"><strong>${esc(a.name)}</strong><br><span class="muted">${esc(a.email)}</span></span></span></div></header>
        <main class="content" data-content></main>
      </div></div>`;
    $("[data-signout]", root).addEventListener("click", () => {
      A.signOut();
      root.innerHTML = "";
      render();
    });
    $("[data-menu]", root).addEventListener("click", () => $("[data-side]", root).classList.toggle("is-open"));
  }

  function paintBadges() {
    const d = db();
    const counts = {
      orders: d.orders.filter((o) => S.OPEN_STATES.includes(o.status) || o.cancelRequest?.state === "requested" || o.status === "Return Requested").length,
      feedback: d.reviews.filter((r) => r.state === "pending").length + d.cases.filter((c) => c.status === "Open").length,
      payments: exceptions().length + d.refunds.filter((r) => r.state === "requested" || r.state === "approved").length,
      products: d.products.filter((p) => p.status === "pending").length,
      inventory: d.products.filter((p) => p.status === "published" && S.stockOf(p.sku).status !== "in").length,
    };
    $$("[data-badge]", root).forEach((el) => {
      const n = counts[el.dataset.badge];
      el.className = n ? "count" : "";
      el.textContent = n || "";
    });
  }

  // Live data: refresh the current page unless someone is typing in a form.
  let frame = 0;
  S.subscribe(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (!A.session() || !$(".shell", root)) return;
      paintBadges();
      const typing = document.activeElement && $("[data-content]", root)?.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
      if (current?.live && !editing && !typing && !document.querySelector(".sheet")) render({ keepScroll: true });
    });
  });

  // ---------- Dashboard ----------
  views.dashboard = (_, q) => {
    const d = db();
    const range = q.range || "7";
    const since = sinceFor(range);
    const inRange = d.orders.filter((o) => o.createdAt >= since);
    const paid = inRange.filter(isPaidSale);
    const refunds = d.refunds.filter((r) => r.state === "processed" && r.processedAt >= since);
    const published = d.products.filter((p) => p.status === "published");
    const low = published.filter((p) => S.stockOf(p.sku).status === "low");
    const out = published.filter((p) => S.stockOf(p.sku).status === "out");
    const kpi = (label, value, sub, href, ic, tone = "") => `<a class="kpi ${tone ? `kpi--${tone}` : ""}" href="${href}"><span class="kpi__label">${icon(ic)}${esc(label)}</span><span class="kpi__value">${value}</span><span class="kpi__sub">${sub}</span></a>`;
    const best = S.bestSellers({ windowDays: 30, limit: 6, includeOutOfStock: true });
    const recent = [...d.orders].sort((a, b) => b.createdAt - a.createdAt).slice(0, 8);
    const label = { today: "today", 7: "last 7 days", 30: "last 30 days" }[range];
    return {
      title: "Dashboard",
      live: true,
      html: `<div class="toolbar-a">${[["today", "Today"], ["7", "7 days"], ["30", "30 days"]].map(([k, l]) => `<a class="chip ${k === range ? "is-active" : ""}" href="#/dashboard?range=${k}">${l}</a>`).join("")}<span class="spacer"></span><span class="muted">Times in IST</span></div>
        <div class="kpis">
          ${kpi("Orders", num(inRange.filter((o) => o.paymentState !== "failed" && o.paymentState !== "expired").length), `${paid.length} paid · ${label}`, "#/orders", "cart")}
          ${kpi("Paid sales", money(sum(paid.map((o) => o.total))), `${money(sum(refunds.map((r) => r.amount)))} refunded · ${label}`, "#/reports", "wallet")}
          ${kpi("Pending dispatch", num(d.orders.filter((o) => S.OPEN_STATES.includes(o.status)).length), "Paid, processing or packed", "#/orders?status=open", "truck", "")}
          ${kpi("Payments to verify", num(exceptions().length), "Exceptions and slow confirmations", "#/payments?tab=exceptions", "alert", exceptions().length ? "bad" : "")}
          ${kpi("Low-stock SKUs", num(low.length), "At or below reorder level", "#/inventory?filter=low", "box", low.length ? "warn" : "")}
          ${kpi("Out-of-stock SKUs", num(out.length), "Published but unsellable", "#/inventory?filter=out", "box", out.length ? "bad" : "")}
          ${kpi("Active campaigns", num(d.promotions.filter((p) => S.promoState(p) === "active" && p.type !== "coupon").length), `${d.promotions.filter((p) => p.type === "coupon" && S.promoState(p) === "active").length} coupons live`, "#/discounts", "percent")}
          ${kpi("Reviews to moderate", num(d.reviews.filter((r) => r.state === "pending").length), `${d.cases.filter((c) => c.status === "Open").length} open support cases`, "#/feedback", "chat")}
        </div>
        <div class="split">
          <section class="card card--flush"><div class="card__head"><h2 class="card__title">Recent orders</h2><a class="link" href="#/orders">All orders</a></div>
            ${table(["Order", "Customer", "Status", "Payment", ">Total"], recent.map((o) => `<tr><td><a class="link" href="#/orders/${o.id}">${o.id}</a><br><span class="muted">${fmtDateTime(o.createdAt)}</span></td><td>${esc(o.name)}</td><td>${chip(o.status, orderTone(o.status))}</td><td>${chip(o.paymentState, payTone(o.paymentState))}</td><td class="r">${money(o.total)}</td></tr>`))}</section>
          <div style="display:grid;gap:20px">
            <section class="card"><div class="card__head"><h2 class="card__title">Best sellers · 30 days</h2><a class="link" href="#/reports?tab=best">Report</a></div>
              <ol class="history">${best.map((b) => `<li><span><strong>${esc(b.product.title)}</strong><small>${b.units} units · ${S.stockOf(b.product.sku).available} available${b.pinned ? " · pinned" : ""}</small></span></li>`).join("")}</ol></section>
            <section class="card"><h2 class="card__title" style="margin-bottom:12px">Shortcuts</h2><div class="toolbar-a">
              ${A.can("products.edit") ? `<a class="mini-btn" href="#/products/new">${icon("plus")} Add product</a>` : ""}
              ${A.can("inventory.adjust") ? `<a class="mini-btn" href="#/inventory">${icon("box")} Receive stock</a>` : ""}
              ${A.can("orders.update") ? `<a class="mini-btn" href="#/orders?status=open">${icon("truck")} Dispatch orders</a>` : ""}
              ${A.can("feedback.moderate") ? `<a class="mini-btn" href="#/feedback">${icon("chat")} Moderate reviews</a>` : ""}
              ${A.can("discounts.edit") ? `<a class="mini-btn" href="#/discounts/new">${icon("percent")} New promotion</a>` : ""}
            </div></section>
          </div>
        </div>`,
    };
  };

  // ---------- Products ----------
  views.products = (rest, q) => {
    if (rest[0]) return productEditor(rest[0] === "new" ? null : rest[0]);
    const d = db();
    const term = (q.q || "").toLowerCase();
    const items = d.products
      .filter((p) => !q.status || p.status === q.status)
      .filter((p) => !q.cat || S.descendants(q.cat).includes(p.categoryId))
      .filter((p) => !term || `${p.title} ${p.sku} ${p.brand}`.toLowerCase().includes(term))
      .sort((a, b) => (a.status === "pending" ? -1 : 0) - (b.status === "pending" ? -1 : 0) || b.updatedAt - a.updatedAt);
    const rowActions = (p) => {
      const out = [`<a class="mini-btn" href="#/products/${p.id}">${icon("edit")} Edit</a>`, `<button class="mini-btn" type="button" data-preview="${p.slug}">${icon("eye")}</button>`];
      if (A.can("products.publish") && p.status === "pending") out.push(`<button class="mini-btn mini-btn--primary" type="button" data-status="approve" data-id="${p.id}">Approve</button>`);
      if (A.can("products.edit") && p.status === "published") out.push(`<button class="mini-btn" type="button" data-status="unpublish" data-id="${p.id}">Unpublish</button>`);
      return out.join("");
    };
    return {
      title: "Products",
      live: true,
      html: `<section class="card card--flush"><div class="card__head">
        <form class="toolbar-a" data-filter>
          <input class="input" name="q" value="${esc(q.q || "")}" placeholder="Search name, SKU, brand" aria-label="Search products">
          <select class="select" name="status" aria-label="Status"><option value="">All statuses</option>${["published", "pending", "draft", "unpublished", "archived"].map((s) => `<option ${q.status === s ? "selected" : ""} value="${s}">${s[0].toUpperCase() + s.slice(1)}</option>`).join("")}</select>
          <select class="select" name="cat" aria-label="Category"><option value="">All categories</option>${catOptions(q.cat)}</select>
        </form>
        ${A.can("products.edit") ? `<a class="btn btn--primary btn--sm" href="#/products/new">${icon("plus")} Add product</a>` : ""}</div>
        ${table(["Product", "Category", ">Price", ">Available", "Status", "Quality", ""], items.map((p) => {
          const pr = S.pricing(p);
          const st = S.stockOf(p.sku);
          return `<tr><td>${productCell(p, `${p.sku}${p.brand ? ` · ${p.brand}` : ""}`)}</td><td>${esc(S.catById(p.categoryId)?.name || "—")}</td>
            <td class="r">${money(pr.price)}${pr.saving ? `<br><span class="muted"><s>${money(pr.regular)}</s></span>` : ""}</td>
            <td class="r">${st.available}<br><span class="muted">${st.onHand} on hand</span></td>
            <td>${chip(p.status, productTone[p.status])}</td>
            <td>${p.quality?.approved ? `<span class="verified">${icon("check")} Approved</span>` : `<span class="muted">${[p.quality?.sourcing, p.quality?.inspection, p.quality?.listing].filter(Boolean).length}/3 checks</span>`}</td>
            <td><div class="actions">${rowActions(p)}</div></td></tr>`;
        }), "No products match.")}</section>`,
      mount(el) {
        const f = $("[data-filter]", el);
        f.addEventListener("change", () => (location.hash = `#/products?${qs(Object.fromEntries(new FormData(f)))}`));
        f.addEventListener("submit", (e) => {
          e.preventDefault();
          location.hash = `#/products?${qs(Object.fromEntries(new FormData(f)))}`;
        });
        $$("[data-preview]", el).forEach((b) => b.addEventListener("click", () => window.open(`index.html#/p/${b.dataset.preview}?preview=1`, "_blank")));
        $$("[data-status]", el).forEach((b) => b.addEventListener("click", () => act(() => A.setProductStatus(b.dataset.id, b.dataset.status), `Product ${b.dataset.status === "approve" ? "approved and published" : `${b.dataset.status}ed`}.`)));
      },
    };
  };

  function productEditor(id) {
    const d = db();
    const p = id ? S.productById(id) : null;
    if (id && !p) return { title: "Product not found", html: `<p class="muted">That product doesn't exist.</p>` };
    const canEdit = A.can("products.edit");
    const canPrice = A.can("products.price");
    const x = p || { sku: "", title: "", categoryId: "", brand: "", short: "", description: "", images: [{ src: "", alt: "" }], specs: [["", ""]], material: "", dimensions: "", color: "", weight: "", care: "", price: "", minPrice: "", taxClass: "standard", maxPerOrder: 5, returnable: true, noPromo: false, tags: [], keywords: "", seoTitle: "", seoDescription: "", featuredRank: 0, bestPin: 0, quality: {}, status: "draft" };
    const st = p ? S.stockOf(p.sku) : null;
    const pr = p ? S.pricing(p) : null;
    const dis = canEdit ? "" : "disabled";
    const field = (name, label, value, attrs = "") => `<label class="field"><span class="field__label">${label}</span><input name="${name}" value="${esc(value ?? "")}" ${attrs} ${dis}></label>`;
    const imgRow = (im = { src: "", alt: "" }) => `<div class="row-edit row-edit--img" data-img-row><img src="${esc(imgUrl(im, 104))}" alt=""><input data-k="src" value="${esc(im.src)}" placeholder="Image URL" ${dis}><input data-k="alt" value="${esc(im.alt)}" placeholder="Alt text (describe the photo)" ${dis}><button class="mini-btn mini-btn--danger" type="button" data-remove-row ${dis}>${icon("trash")}</button></div>`;
    const specRow = ([k, v] = ["", ""]) => `<div class="row-edit" data-spec-row><input data-k="k" value="${esc(k)}" placeholder="Specification" ${dis}><input data-k="v" value="${esc(v)}" placeholder="Value" ${dis}><button class="mini-btn mini-btn--danger" type="button" data-remove-row ${dis}>${icon("trash")}</button></div>`;
    const q = x.quality || {};
    const actions = [];
    if (p) {
      if (canEdit && ["draft", "unpublished"].includes(p.status)) actions.push(`<button class="mini-btn" type="button" data-status="submit">Submit for approval</button>`);
      if (A.can("products.publish") && p.status === "pending") actions.push(`<button class="mini-btn mini-btn--primary" type="button" data-status="approve">Approve &amp; publish</button><button class="mini-btn" type="button" data-status="reject">Send back</button>`);
      if (A.can("products.publish") && p.status === "unpublished" && q.approved) actions.push(`<button class="mini-btn" type="button" data-status="publish">Publish</button>`);
      if (canEdit && p.status === "published") actions.push(`<button class="mini-btn" type="button" data-status="unpublish">Unpublish</button>`);
      if (canEdit && p.status !== "archived") actions.push(`<button class="mini-btn mini-btn--danger" type="button" data-status="archive">Archive</button>`);
      if (canEdit && p.status === "archived") actions.push(`<button class="mini-btn" type="button" data-status="restore">Restore to draft</button>`);
      actions.push(`<button class="mini-btn" type="button" data-preview>${icon("eye")} Preview</button>`);
      if (canEdit) actions.push(`<button class="mini-btn" type="button" data-duplicate>${icon("copy")} Duplicate</button>`);
    }
    return {
      title: p ? p.title : "New product",
      mount: (el) => mountProductEditor(el, p),
      html: `<form data-product-form>
        <div class="statusbar">
          <a class="mini-btn" href="#/products">${icon("left")} Products</a>
          ${p ? chip(p.status, productTone[p.status]) : chip("new draft", "info")}
          ${p?.quality?.approved ? `<span class="muted">Approved by ${esc(p.quality.approvedBy)}</span>` : ""}
          <span class="spacer"></span>${actions.join("")}
          ${canEdit ? `<button class="btn btn--primary btn--sm" type="submit">${icon("check")} Save</button>` : ""}
        </div>
        <div class="split" style="margin-top:20px">
          <div style="display:grid;gap:20px">
            <section class="card"><div class="form-section"><h3>Product details</h3>
              <div class="form-grid">${field("title", "Product name", x.title, "required")}${field("sku", "SKU (unique)", x.sku, 'required style="text-transform:uppercase"')}
                <label class="field"><span class="field__label">Category</span><select name="categoryId" required ${dis}><option value="">Choose…</option>${catOptions(x.categoryId)}</select></label>
                ${field("brand", "Brand", x.brand)}
                ${field("short", "Key attribute (shown on cards)", x.short, 'placeholder="e.g. Stoneware · 300 ml × 4"')}
                ${field("tags", "Tags (comma separated)", (x.tags || []).join(", "))}
                <label class="field span-2"><span class="field__label">Full description</span><textarea name="description" rows="4" ${dis}>${esc(x.description)}</textarea></label>
                ${field("keywords", "Search keywords", x.keywords, 'placeholder="Extra words shoppers might use"')}
              </div></div>
              <div class="form-section"><h3>Images</h3><p class="field__hint">Use real, clear product photos. Alt text describes the photo for screen readers.</p><div class="rows" data-images>${(x.images.length ? x.images : [{ src: "", alt: "" }]).map(imgRow).join("")}</div>
                ${canEdit ? `<button class="mini-btn" type="button" data-add-img>${icon("plus")} Add image</button>` : ""}</div>
              <div class="form-section"><h3>Specifications</h3>
                <div class="form-grid">${field("material", "Material", x.material)}${field("dimensions", "Size / dimensions", x.dimensions)}${field("color", "Colour / variant", x.color)}${field("weight", "Weight", x.weight)}
                <label class="field span-2"><span class="field__label">Care and usage</span><textarea name="care" rows="2" ${dis}>${esc(x.care)}</textarea></label></div>
                <div class="rows" data-specs>${(x.specs.length ? x.specs : [["", ""]]).map(specRow).join("")}</div>
                ${canEdit ? `<button class="mini-btn" type="button" data-add-spec>${icon("plus")} Add specification</button>` : ""}</div>
              <div class="form-section"><h3>Search engines</h3><div class="form-grid">${field("seoTitle", "SEO title", x.seoTitle, 'maxlength="70"')}${field("seoDescription", "SEO description", x.seoDescription, 'maxlength="160"')}</div></div>
            </section>
          </div>
          <div style="display:grid;gap:20px">
            <section class="card"><div class="form-section"><h3>Pricing</h3>
              <div class="form-grid">
                <label class="field"><span class="field__label">Regular price (₹, incl. GST)</span><input name="price" type="number" min="1" step="0.01" value="${esc(x.price)}" required ${canPrice && canEdit ? "" : "disabled"}></label>
                <label class="field"><span class="field__label">Minimum selling price</span><input name="minPrice" type="number" min="0" step="0.01" value="${esc(x.minPrice ?? "")}" placeholder="Default ${d.settings.priceFloorPercent}% of price" ${canPrice && canEdit ? "" : "disabled"}></label>
                <label class="field span-2"><span class="field__label">Tax class</span><select name="taxClass" ${dis}>${Object.entries(d.settings.taxClasses).map(([k, t]) => `<option value="${k}" ${x.taxClass === k ? "selected" : ""}>${esc(t.label)}</option>`).join("")}</select></label>
                <label class="check span-2"><input type="checkbox" name="noPromo" ${x.noPromo ? "checked" : ""} ${dis}> <span>Exclude from all promotions and coupons</span></label>
              </div>
              ${pr ? `<p class="notice">${icon("tag")} <span>Customers pay <strong>${money(pr.price)}</strong> now${pr.promo ? ` (${esc(pr.promo.name)})` : ""}. Floor: ${money(pr.floor)}.</span></p>` : ""}
              ${canPrice ? "" : `<p class="field__hint">${icon("lock")} Your role can't change prices.</p>`}
            </div>
            <div class="form-section"><h3>Stock and ordering</h3>
              ${st ? `<p>${st.available} available · ${st.onHand} on hand · ${st.reserved} held · ${st.committed} allocated · ${st.quarantine} in quarantine</p><a class="link" href="#/inventory?q=${encodeURIComponent(p.sku)}">Manage stock in Inventory</a>` : `<p class="field__hint">Stock starts at 0. Receive stock in Inventory after saving.</p>`}
              <div class="form-grid">${field("maxPerOrder", "Max quantity per order", x.maxPerOrder, 'type="number" min="1" required')}
              <label class="check" style="align-self:end;padding-bottom:12px"><input type="checkbox" name="returnable" ${x.returnable ? "checked" : ""} ${dis}> <span>Returnable</span></label></div>
            </div>
            <div class="form-section"><h3>Merchandising</h3><div class="form-grid">
              ${field("featuredRank", "Featured rank (higher shows first)", x.featuredRank, 'type="number" min="0"')}
              ${field("bestPin", "Pin in best sellers (position, 0 = auto)", x.bestPin || 0, 'type="number" min="0"')}</div></div>
            </section>
            <section class="card"><div class="form-section"><h3>Quality gate</h3><p class="field__hint">All three checks are needed before submitting for approval. A catalogue owner then approves copy, photos, price and stock.</p>
              <label class="check"><input type="checkbox" name="q_sourcing" ${q.sourcing ? "checked" : ""} ${dis}> <span><strong>Sourcing &amp; acceptance</strong><br><span class="field__hint">Source recorded, category fit, durability and price position agreed.</span></span></label>
              <label class="check"><input type="checkbox" name="q_inspection" ${q.inspection ? "checked" : ""} ${dis}> <span><strong>Receipt &amp; inspection</strong><br><span class="field__hint">Counted, visually checked, dimensions verified, damaged units separated.</span></span></label>
              <label class="check"><input type="checkbox" name="q_listing" ${q.listing ? "checked" : ""} ${dis}> <span><strong>Listing quality</strong><br><span class="field__hint">Real images, readable specs, exact size, care, returns, honest price.</span></span></label>
              <label class="field"><span class="field__label">Evidence / notes</span><textarea name="q_notes" rows="2" ${dis}>${esc(q.notes || "")}</textarea></label>
              ${q.approved ? `<p class="verified">${icon("check")} Approved by ${esc(q.approvedBy)}${q.approvedAt ? ` on ${fmtDate(q.approvedAt)}` : ""}</p>` : ""}
            </div></section>
          </div>
        </div></form>`,
    };
  }

  function mountProductEditor(el, p) {
    editing = true;
    const form = $("[data-product-form]", el);
    const imgRow = (im) => {
      const tmp = document.createElement("div");
      tmp.innerHTML = `<div class="row-edit row-edit--img" data-img-row><img src="${esc(imgUrl(im, 104))}" alt=""><input data-k="src" value="" placeholder="Image URL"><input data-k="alt" placeholder="Alt text (describe the photo)"><button class="mini-btn mini-btn--danger" type="button" data-remove-row>${icon("trash")}</button></div>`;
      return tmp.firstElementChild;
    };
    $("[data-add-img]", el)?.addEventListener("click", () => $("[data-images]", el).append(imgRow("")));
    $("[data-add-spec]", el)?.addEventListener("click", () => {
      const tmp = document.createElement("div");
      tmp.innerHTML = `<div class="row-edit" data-spec-row><input data-k="k" placeholder="Specification"><input data-k="v" placeholder="Value"><button class="mini-btn mini-btn--danger" type="button" data-remove-row>${icon("trash")}</button></div>`;
      $("[data-specs]", el).append(tmp.firstElementChild);
    });
    el.addEventListener("click", (e) => e.target.closest("[data-remove-row]")?.closest("[data-img-row], [data-spec-row]")?.remove());
    el.addEventListener("change", (e) => {
      const row = e.target.closest("[data-img-row]");
      if (row && e.target.dataset.k === "src") $("img", row).src = imgUrl(e.target.value, 104);
    });
    const collect = () => {
      const fd = new FormData(form);
      return {
        id: p?.id || null,
        title: fd.get("title"),
        sku: fd.get("sku"),
        categoryId: fd.get("categoryId"),
        brand: fd.get("brand"),
        short: fd.get("short"),
        description: fd.get("description"),
        tags: String(fd.get("tags") || "").split(",").map((t) => t.trim()).filter(Boolean),
        keywords: fd.get("keywords"),
        images: $$("[data-img-row]", el).map((r) => ({ src: $('[data-k="src"]', r).value.trim(), alt: $('[data-k="alt"]', r).value.trim(), ...(p?.images.find((i) => i.src === $('[data-k="src"]', r).value.trim() && i.alt === $('[data-k="alt"]', r).value.trim())?.zoom ? { zoom: p.images.find((i) => i.src === $('[data-k="src"]', r).value.trim() && i.alt === $('[data-k="alt"]', r).value.trim()).zoom } : {}) })),
        specs: $$("[data-spec-row]", el).map((r) => [$('[data-k="k"]', r).value.trim(), $('[data-k="v"]', r).value.trim()]),
        material: fd.get("material"),
        dimensions: fd.get("dimensions"),
        color: fd.get("color"),
        weight: fd.get("weight"),
        care: fd.get("care"),
        price: fd.has("price") ? fd.get("price") : p?.price,
        minPrice: fd.has("minPrice") ? fd.get("minPrice") : p?.minPrice ?? "",
        taxClass: fd.get("taxClass"),
        noPromo: fd.get("noPromo") === "on",
        maxPerOrder: fd.get("maxPerOrder"),
        returnable: fd.get("returnable") === "on",
        featuredRank: fd.get("featuredRank"),
        bestPin: fd.get("bestPin"),
        seoTitle: fd.get("seoTitle"),
        seoDescription: fd.get("seoDescription"),
        quality: { sourcing: fd.get("q_sourcing") === "on", inspection: fd.get("q_inspection") === "on", listing: fd.get("q_listing") === "on", notes: fd.get("q_notes") || "" },
      };
    };
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const saved = await act(() => A.saveProduct(collect()), p ? "Product saved." : "Draft created. Add stock and complete the quality checks, then submit for approval.");
      if (saved) {
        editing = false;
        if (!p) location.hash = `#/products/${saved.id}`;
        else render({ keepScroll: true });
      }
    });
    $$("[data-status]", el).forEach((b) =>
      b.addEventListener("click", async () => {
        if (b.dataset.status === "archive" && !(await confirmDialog({ title: "Archive this product?", body: "It disappears from the store and admin lists. Past orders keep their line items.", confirm: "Archive", danger: true }))) return;
        if (A.can("products.edit")) await act(() => A.saveProduct(collect()));
        if (await act(() => A.setProductStatus(p.id, b.dataset.status), "Status updated.")) {
          editing = false;
          render({ keepScroll: true });
        }
      })
    );
    $("[data-preview]", el)?.addEventListener("click", () => window.open(`index.html#/p/${p.slug}?preview=1`, "_blank"));
    $("[data-duplicate]", el)?.addEventListener("click", async () => {
      const copy = await act(() => A.duplicateProduct(p.id), "Duplicated as a new draft.");
      if (copy) location.hash = `#/products/${copy.id}`;
    });
  }

  // ---------- Categories ----------
  views.categories = () => {
    const d = db();
    const rows = [];
    const walk = (parentId, depth) =>
      d.categories
        .filter((c) => (c.parentId || null) === parentId && !c.archived)
        .sort((a, b) => a.order - b.order)
        .forEach((c) => {
          const ids = S.descendants(c.id);
          const all = d.products.filter((p) => ids.includes(p.categoryId) && p.status !== "archived");
          const live = all.filter((p) => p.status === "published");
          const can = A.can("categories.edit");
          rows.push(`<tr><td><span class="cell-product" style="padding-left:${depth * 28}px"><img src="${imgUrl(c.image, 88)}" alt=""><span><strong>${esc(c.name)}</strong><small>/c/${esc(c.slug)}</small></span></span></td>
            <td class="r">${live.length} / ${all.length}</td><td class="r">${c.order}</td><td>${chip(c.active ? "Visible" : "Hidden", c.active ? "ok" : "bad")}</td>
            <td><div class="actions">${can ? `<button class="mini-btn" type="button" data-edit-cat="${c.id}">${icon("edit")} Edit</button>
              <button class="mini-btn" type="button" data-toggle-cat="${c.id}">${c.active ? "Hide" : "Show"}</button>
              <button class="mini-btn" type="button" data-move-cat="${c.id}">Move products</button>
              <button class="mini-btn mini-btn--danger" type="button" data-archive-cat="${c.id}">Archive</button>` : ""}</div></td></tr>`);
          walk(c.id, depth + 1);
        });
    walk(null, 0);
    return {
      title: "Categories",
      live: true,
      html: `<section class="card card--flush"><div class="card__head"><p class="muted">Category names and URLs must be unique. Hidden categories disappear from menus; their products must be moved or hidden first.</p>
        ${A.can("categories.edit") ? `<button class="btn btn--primary btn--sm" type="button" data-new-cat>${icon("plus")} Add category</button>` : ""}</div>
        ${table(["Category", ">Live / total products", ">Order", "Menu", ""], rows)}</section>`,
      mount(el) {
        $("[data-new-cat]", el)?.addEventListener("click", (e) => categorySheet(null, e.currentTarget));
        $$("[data-edit-cat]", el).forEach((b) => b.addEventListener("click", () => categorySheet(S.catById(b.dataset.editCat), b)));
        $$("[data-toggle-cat]", el).forEach((b) =>
          b.addEventListener("click", async () => {
            const c = S.catById(b.dataset.toggleCat);
            if (c.active) {
              const live = db().products.filter((p) => S.descendants(c.id).includes(p.categoryId) && p.status === "published");
              if (live.length) return hideCategorySheet(c, live, b);
            }
            act(() => A.setCategoryActive(c.id, !c.active), c.active ? "Category hidden." : "Category is now visible in the menu.");
          })
        );
        $$("[data-move-cat]", el).forEach((b) => b.addEventListener("click", () => moveProductsSheet(S.catById(b.dataset.moveCat), b)));
        $$("[data-archive-cat]", el).forEach((b) =>
          b.addEventListener("click", async () => {
            if (await confirmDialog({ title: "Archive category?", body: "Only empty categories can be archived.", confirm: "Archive", danger: true })) act(() => A.archiveCategory(b.dataset.archiveCat), "Category archived.");
          })
        );
      },
    };
  };

  function categorySheet(c, origin) {
    const sheet = openSheet({
      title: c ? `Edit ${c.name}` : "New category",
      side: "right",
      origin,
      html: `<form class="form-section" data-cat-form>
        <label class="field"><span class="field__label">Name</span><input name="name" value="${esc(c?.name || "")}" required></label>
        <label class="field"><span class="field__label">URL slug</span><input name="slug" value="${esc(c?.slug || "")}" placeholder="Generated from the name"></label>
        <label class="field"><span class="field__label">Parent</span><select name="parentId">${catOptions(c?.parentId || "", { none: true, exclude: c ? S.descendants(c.id) : [] })}</select></label>
        <label class="field"><span class="field__label">Description</span><textarea name="description" rows="3">${esc(c?.description || "")}</textarea></label>
        <label class="field"><span class="field__label">Banner / icon image URL</span><input name="image" value="${esc(c?.image || "")}"></label>
        <label class="field"><span class="field__label">Sort order</span><input name="order" type="number" value="${c?.order ?? 10}"></label>
        <label class="field"><span class="field__label">SEO title</span><input name="seoTitle" value="${esc(c?.seoTitle || "")}"></label>
        <label class="field"><span class="field__label">SEO description</span><input name="seoDescription" value="${esc(c?.seoDescription || "")}"></label>
        ${c ? "" : `<p class="field__hint">New categories start hidden. Show them once products are assigned.</p>`}
        <div class="sheet__foot"><button class="btn btn--primary" type="submit">Save category</button></div></form>`,
    });
    $("[data-cat-form]", sheet.el).addEventListener("submit", async (e) => {
      e.preventDefault();
      if (await act(() => A.saveCategory({ id: c?.id, ...Object.fromEntries(new FormData(e.target)) }), "Category saved.")) sheet.close();
    });
  }

  function hideCategorySheet(c, live, origin) {
    const sheet = openSheet({
      title: `Hide ${c.name}`,
      side: "center",
      origin,
      html: `<form class="dialog" data-hide-form style="padding-top:0"><p class="dialog__body">${live.length} published product(s) are in this category. Choose what happens to them before it leaves the menu.</p>
        <label class="choice"><input type="radio" name="strategy" value="move" checked><span><strong>Move them to another category</strong><select name="targetId" style="margin-top:8px;width:100%" class="select">${catOptions("", { exclude: S.descendants(c.id) })}</select></span></label>
        <label class="choice"><input type="radio" name="strategy" value="hide"><span><strong>Unpublish them</strong><small>They stay in admin and can be republished later.</small></span></label>
        <div class="dialog__actions"><button class="btn btn--ghost" type="button" data-close>Cancel</button><button class="btn btn--danger" type="submit">Hide category</button></div></form>`,
    });
    $("[data-hide-form]", sheet.el).addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      if (await act(() => A.setCategoryActive(c.id, false, { strategy: fd.get("strategy"), targetId: fd.get("targetId") }), "Category hidden.")) sheet.close();
    });
  }

  function moveProductsSheet(c, origin) {
    const items = db().products.filter((p) => p.categoryId === c.id && p.status !== "archived");
    const sheet = openSheet({
      title: `Move products from ${c.name}`,
      side: "right",
      origin,
      html: `<form class="form-section" data-move-form>${items.length ? `<div class="check-list">${items.map((p) => `<label class="check"><input type="checkbox" name="ids" value="${p.id}" checked> <span>${esc(p.title)} <span class="muted">${esc(p.sku)}</span></span></label>`).join("")}</div>
        <label class="field"><span class="field__label">Move to</span><select name="targetId">${catOptions("", { exclude: [c.id] })}</select></label>
        <div class="sheet__foot"><button class="btn btn--primary" type="submit">Move selected</button></div>` : '<p class="muted">No products are assigned directly to this category.</p>'}</form>`,
    });
    $("[data-move-form]", sheet.el).addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      if (await act(() => A.moveProducts(fd.getAll("ids"), fd.get("targetId")), "Products moved.")) sheet.close();
    });
  }

  // ---------- Inventory ----------
  views.inventory = (rest, q) => {
    if (rest[0] === "ledger") return ledgerView(q);
    const d = db();
    const term = (q.q || "").toLowerCase();
    const items = d.products
      .filter((p) => p.status !== "archived")
      .map((p) => ({ p, st: S.stockOf(p.sku) }))
      .filter(({ p }) => !term || `${p.title} ${p.sku}`.toLowerCase().includes(term))
      .filter(({ st }) => !q.filter || (q.filter === "quarantine" ? st.quarantine > 0 : st.status === q.filter))
      .sort((a, b) => a.st.available - b.st.available);
    const canAdj = A.can("inventory.adjust");
    const held = d.reservations.filter((r) => r.state === "active" && r.expiresAt > Date.now());
    return {
      title: "Inventory",
      live: true,
      html: `<div class="kpis">
          <div class="kpi"><span class="kpi__label">SKUs tracked</span><span class="kpi__value">${items.length}</span></div>
          <div class="kpi"><span class="kpi__label">Units held for checkout</span><span class="kpi__value">${held.reduce((s, r) => s + r.qty, 0)}</span><span class="kpi__sub">${held.length} active hold(s), ${d.settings.reservationMinutes}-minute window</span></div>
          <div class="kpi"><span class="kpi__label">Allocated to paid orders</span><span class="kpi__value">${Object.values(d.inventory).reduce((s, i) => s + i.committed, 0)}</span></div>
          <div class="kpi"><span class="kpi__label">In quarantine</span><span class="kpi__value">${Object.values(d.inventory).reduce((s, i) => s + i.quarantine, 0)}</span><span class="kpi__sub">Returns and receipts awaiting inspection</span></div>
        </div>
        <section class="card card--flush"><div class="card__head"><form class="toolbar-a" data-filter>
          <input class="input" name="q" value="${esc(q.q || "")}" placeholder="Search SKU or product" aria-label="Search">
          ${[["", "All"], ["low", "Low stock"], ["out", "Out of stock"], ["quarantine", "Quarantine"]].map(([k, l]) => `<a class="chip ${(q.filter || "") === k ? "is-active" : ""}" href="#/inventory?${qs({ q: q.q, filter: k })}">${l}</a>`).join("")}</form>
          <div class="toolbar-a"><a class="mini-btn" href="#/inventory/ledger">${icon("log")} Movement ledger</a>${canAdj ? `<button class="mini-btn" type="button" data-sweep>${icon("refresh")} Release expired holds</button>` : ""}</div></div>
          <p class="muted" style="padding:0 20px 12px">Available to sell = sellable on hand − held for checkout − allocated to paid orders. Damaged, returned and unchecked stock is never counted.</p>
          ${table(["Product", ">On hand", ">Held", ">Allocated", ">Available", ">Quarantine", ">Reorder at", "Last receipt", ""], items.map(({ p, st }) => `<tr>
            <td>${productCell(p)}</td><td class="r">${st.onHand}</td><td class="r">${st.reserved}</td><td class="r">${st.committed}</td>
            <td class="r"><strong>${st.available}</strong><br>${st.status === "out" ? chip("Out", "bad") : st.status === "low" ? chip("Low", "warn") : ""}</td>
            <td class="r">${st.quarantine}</td><td class="r">${st.reorder}</td><td class="nowrap">${st.lastReceipt ? `${fmtDate(st.lastReceipt)}<br><span class="muted">${Math.floor((Date.now() - st.lastReceipt) / DAY)} days ago</span>` : "—"}</td>
            <td><div class="actions">${canAdj ? `<button class="mini-btn mini-btn--primary" type="button" data-receive="${p.sku}">Receive</button><button class="mini-btn" type="button" data-adjust="${p.sku}">Adjust</button>${st.quarantine ? `<button class="mini-btn" type="button" data-inspect="${p.sku}">Inspect</button>` : ""}` : ""}<a class="mini-btn" href="#/inventory/ledger?sku=${p.sku}">Ledger</a></div></td></tr>`), "No SKUs match.")}
        </section>`,
      mount(el) {
        const f = $("[data-filter]", el);
        f.addEventListener("submit", (e) => {
          e.preventDefault();
          location.hash = `#/inventory?${qs({ q: f.q.value, filter: q.filter })}`;
        });
        $("[data-sweep]", el)?.addEventListener("click", () => act(() => A.sweep(), "Expired holds released."));
        $$("[data-receive]", el).forEach((b) => b.addEventListener("click", () => stockSheet("receive", b.dataset.receive, b)));
        $$("[data-adjust]", el).forEach((b) => b.addEventListener("click", () => stockSheet("adjust", b.dataset.adjust, b)));
        $$("[data-inspect]", el).forEach((b) => b.addEventListener("click", () => stockSheet("inspect", b.dataset.inspect, b)));
      },
    };
  };

  function stockSheet(kind, sku, origin) {
    const p = S.productBySku(sku);
    const st = S.stockOf(sku);
    const titles = { receive: "Receive stock", adjust: "Adjust stock", inspect: "Inspect quarantined stock" };
    const forms = {
      receive: `<label class="field"><span class="field__label">Quantity received</span><input name="qty" type="number" min="1" step="1" required autofocus></label>
        <label class="field"><span class="field__label">Reference (goods receipt / invoice no.)</span><input name="ref" required placeholder="GRN-0123"></label>
        <label class="choice"><input type="radio" name="qc" value="1" checked><span><strong>Quality check passed</strong><small>Units become sellable immediately.</small></span></label>
        <label class="choice"><input type="radio" name="qc" value="0"><span><strong>Not yet inspected</strong><small>Units go to quarantine until approved.</small></span></label>
        <label class="field"><span class="field__label">Note</span><input name="note" placeholder="Condition, damaged units separated, etc."></label>`,
      adjust: `<p class="notice">${icon("info")} <span>${st.available} available · ${st.reserved} held · ${st.committed} allocated. Reductions can't take available stock below zero.</span></p>
        <label class="field"><span class="field__label">Change</span><select name="dir"><option value="-1">Remove units (damage, loss, count correction)</option><option value="1">Add units (count correction)</option></select></label>
        <label class="field"><span class="field__label">Quantity</span><input name="qty" type="number" min="1" step="1" required></label>
        <label class="field"><span class="field__label">Reason</span><select name="reason" required><option>Damaged in storage</option><option>Lost / missing</option><option>Cycle count correction</option><option>Sample / display use</option><option>Other</option></select></label>
        <label class="field"><span class="field__label">Details / reference</span><input name="ref" placeholder="Count sheet, incident no."></label>
        <label class="field"><span class="field__label">Reorder threshold</span><input name="reorder" type="number" min="0" value="${st.reorder}"></label>`,
      inspect: `<p class="notice">${icon("info")} <span>${st.quarantine} unit(s) waiting for inspection.</span></p>
        <label class="field"><span class="field__label">Quantity inspected</span><input name="qty" type="number" min="1" max="${st.quarantine}" value="${st.quarantine}" required></label>
        <label class="choice"><input type="radio" name="decision" value="approve" checked><span><strong>Approve for sale</strong><small>Moves into sellable stock.</small></span></label>
        <label class="choice"><input type="radio" name="decision" value="write-off"><span><strong>Write off</strong><small>Damaged or not resaleable.</small></span></label>
        <label class="field"><span class="field__label">Inspection note</span><input name="note" required></label>`,
    };
    const sheet = openSheet({ title: `${titles[kind]} · ${p.title}`, side: "right", origin, html: `<form class="form-section" data-stock-form>${forms[kind]}<div class="sheet__foot"><button class="btn btn--primary" type="submit">Record movement</button></div></form>` });
    $("[data-stock-form]", sheet.el).addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      let ok;
      if (kind === "receive") ok = await act(() => A.receiveStock(sku, fd.qty, { ref: fd.ref, qcPassed: fd.qc === "1", note: fd.note }), "Stock received and logged.");
      if (kind === "adjust") {
        ok = await act(() => A.adjustStock(sku, Number(fd.dir) * Number(fd.qty), { reason: fd.reason, ref: fd.ref }), "Adjustment logged.");
        if (ok && Number(fd.reorder) !== st.reorder) await act(() => A.setReorder(sku, fd.reorder));
      }
      if (kind === "inspect") ok = await act(() => A.inspectQuarantine(sku, fd.qty, fd.decision, fd.note), "Inspection recorded.");
      if (ok) sheet.close();
    });
  }

  function ledgerView(q) {
    const d = db();
    const rows = d.movements
      .filter((m) => !q.sku || m.sku === q.sku)
      .filter((m) => !q.type || m.type === q.type)
      .sort((a, b) => b.at - a.at)
      .slice(0, 400);
    const types = [...new Set(d.movements.map((m) => m.type))].sort();
    return {
      title: "Stock movement ledger",
      live: true,
      html: `<section class="card card--flush"><div class="card__head"><div class="toolbar-a"><a class="mini-btn" href="#/inventory">${icon("left")} Inventory</a>
        <select class="select" data-type><option value="">All movement types</option>${types.map((t) => `<option ${q.type === t ? "selected" : ""}>${t}</option>`).join("")}</select>
        ${q.sku ? `<span class="chip is-active">${esc(q.sku)}</span>` : ""}</div>
        <button class="mini-btn" type="button" data-export>${icon("download")} CSV</button></div>
        ${table(["When", "SKU", "Type", ">Qty", "Reason", "Reference", "By"], rows.map((m) => `<tr><td class="nowrap">${fmtDateTime(m.at)}</td><td>${esc(m.sku)}</td><td>${esc(m.type)}</td><td class="r">${m.qty > 0 ? "+" : ""}${m.qty}</td><td>${esc(m.reason)}</td><td>${esc(m.ref)}</td><td>${esc(m.actor)}</td></tr>`), "No movements yet.")}</section>`,
      mount(el) {
        $("[data-type]", el).addEventListener("change", (e) => (location.hash = `#/inventory/ledger?${qs({ sku: q.sku, type: e.target.value })}`));
        $("[data-export]", el).addEventListener("click", () => csv("stock-ledger.csv", ["When (IST)", "SKU", "Type", "Qty", "Reason", "Reference", "User"], rows.map((m) => [fmtDateTime(m.at), m.sku, m.type, m.qty, m.reason, m.ref, m.actor])));
      },
    };
  }

  // ---------- Orders ----------
  views.orders = (rest, q) => {
    if (rest[0]) return orderDetail(rest[0]);
    const d = db();
    const term = (q.q || "").toLowerCase();
    const statusFilter = {
      "": () => true,
      open: (o) => S.OPEN_STATES.includes(o.status) || o.cancelRequest?.state === "requested" || o.status === "Return Requested",
      unpaid: (o) => o.status === "Placed",
    };
    const items = d.orders
      .filter(statusFilter[q.status || ""] || ((o) => o.status === q.status))
      .filter((o) => !term || `${o.id} ${o.name} ${o.email} ${o.phone}`.toLowerCase().includes(term))
      .sort((a, b) => b.createdAt - a.createdAt);
    const statuses = ["Placed", "Paid", "Processing", "Packed", "Shipped", "Delivered", "Cancelled", "Return Requested", "Returned", "Refunded"];
    return {
      title: "Orders",
      live: true,
      html: `<section class="card card--flush"><div class="card__head"><form class="toolbar-a" data-filter>
        <input class="input" name="q" value="${esc(q.q || "")}" placeholder="Order no., name, email, phone" aria-label="Search orders">
        <select class="select" name="status" aria-label="Status"><option value="">All orders</option><option value="open" ${q.status === "open" ? "selected" : ""}>Needs action</option><option value="unpaid" ${q.status === "unpaid" ? "selected" : ""}>Awaiting payment</option>${statuses.map((s) => `<option ${q.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></form>
        <button class="mini-btn" type="button" data-export>${icon("download")} CSV</button></div>
        ${table(["Order", "Customer", ">Items", ">Total", "Payment", "Status", "Flags"], items.slice(0, 300).map((o) => `<tr>
          <td><a class="link" href="#/orders/${o.id}">${o.id}</a><br><span class="muted">${fmtDateTime(o.createdAt)}</span></td>
          <td>${esc(o.name)}<br><span class="muted">${esc(o.email)}</span></td><td class="r">${o.lines.reduce((s, l) => s + l.qty, 0)}</td><td class="r">${money(o.total)}</td>
          <td>${chip(o.paymentState, payTone(o.paymentState))}</td><td>${chip(o.status, orderTone(o.status))}</td>
          <td>${[o.cancelRequest?.state === "requested" ? chip("Cancel request", "warn") : "", o.exception ? chip("Exception", "bad") : ""].join(" ")}</td></tr>`), "No orders match.")}</section>`,
      mount(el) {
        const f = $("[data-filter]", el);
        f.addEventListener("change", () => (location.hash = `#/orders?${qs(Object.fromEntries(new FormData(f)))}`));
        f.addEventListener("submit", (e) => {
          e.preventDefault();
          location.hash = `#/orders?${qs(Object.fromEntries(new FormData(f)))}`;
        });
        $("[data-export]", el).addEventListener("click", () =>
          csv("orders.csv", ["Order", "Created (IST)", "Customer", "Email", "Status", "Payment", "Items", "Discounts", "Coupon", "Shipping", "GST", "Total"], items.map((o) => [o.id, fmtDateTime(o.createdAt), o.name, o.email, o.status, o.paymentState, o.lines.reduce((s, l) => s + l.qty, 0), o.autoDiscount, o.coupon?.amount || 0, o.shipping, o.tax, o.total]))
        );
      },
    };
  };

  function orderDetail(id) {
    const d = db();
    const o = d.orders.find((x) => x.id === id);
    if (!o) return { title: "Order not found", html: `<p class="muted">No order ${esc(id)}.</p>` };
    const canUpdate = A.can("orders.update");
    const pays = d.payments.filter((p) => p.orderId === o.id).sort((a, b) => a.createdAt - b.createdAt);
    const refunds = d.refunds.filter((r) => r.orderId === o.id);
    const next = { Paid: ["Processing", "Confirm stock picked"], Processing: ["Packed", "Mark packed"], Packed: ["Shipped", "Mark shipped"], Shipped: ["Delivered", "Mark delivered"], "Return Requested": ["Returned", "Mark return received"] }[o.status];
    const btns = [];
    if (canUpdate && next && (o.paymentState === "paid" || o.status === "Return Requested")) btns.push(`<button class="btn btn--primary btn--sm" type="button" data-advance="${next[0]}">${next[1]}</button>`);
    if (["Processing", "Packed", "Paid"].includes(o.status)) btns.push(`<button class="mini-btn" type="button" data-slip>${icon("print")} Packing slip</button>`);
    if (canUpdate && ["Placed", "Paid", "Processing", "Packed"].includes(o.status)) btns.push(`<button class="mini-btn mini-btn--danger" type="button" data-cancel>Cancel order</button>`);
    if (canUpdate && o.cancelRequest?.state === "requested") btns.push(`<button class="mini-btn" type="button" data-decline="cancel">Decline cancellation</button>`);
    if (canUpdate && o.status === "Return Requested") btns.push(`<button class="mini-btn" type="button" data-decline="return">Decline return</button>`);
    if (A.can("refunds.request") && o.paymentState === "paid") btns.push(`<button class="mini-btn" type="button" data-refund>${icon("wallet")} Request refund</button>`);
    return {
      title: `Order ${o.id}`,
      live: true,
      html: `<div class="statusbar"><a class="mini-btn" href="#/orders">${icon("left")} Orders</a>${chip(o.status, orderTone(o.status))}${chip(`payment ${o.paymentState}`, payTone(o.paymentState))}
          ${o.cancelRequest?.state === "requested" ? chip(`Customer asked to cancel: ${o.cancelRequest.reason}`, "warn") : ""}<span class="spacer"></span>${btns.join("")}</div>
        ${o.exception ? `<p class="notice notice--error">${icon("alert")} <span><strong>Exception:</strong> ${esc(o.exception)}. Resolve it in Payments before dispatch.</span></p>` : ""}
        ${o.paymentState !== "paid" && o.status === "Placed" ? `<p class="notice notice--warn">${icon("lock")} <span>Not paid. Orders are never processed or dispatched before the gateway confirms payment.</span></p>` : ""}
        <div class="split">
          <div style="display:grid;gap:20px">
            <section class="card card--flush"><div class="card__head"><h2 class="card__title">Items (price snapshot at order time)</h2></div>
              ${table(["Item", ">Qty", ">Regular", ">Charged", "Offer", ">GST", ">Line"], o.lines.map((l) => `<tr><td>${productCell({ title: l.title, images: [{ src: l.image }] }, l.sku)}</td><td class="r">${l.qty}</td><td class="r">${money(l.regular)}</td><td class="r">${money(l.unit)}</td><td>${esc(l.promoName || "—")}</td><td class="r">${l.taxRate}%</td><td class="r">${money(l.unit * l.qty)}</td></tr>`))}
              <div style="padding:16px 20px"><dl class="totals" style="max-width:360px;margin-left:auto">
                <div><dt>Items at regular price</dt><dd>${money(o.regularTotal)}</dd></div>
                ${o.autoDiscount ? `<div class="discount"><dt>Automatic offers</dt><dd>−${money(o.autoDiscount)}</dd></div>` : ""}
                ${o.coupon ? `<div class="discount"><dt>Coupon ${esc(o.coupon.code)}</dt><dd>−${money(o.coupon.amount)}</dd></div>` : ""}
                <div><dt>Shipping (${esc(o.shippingZone)})</dt><dd>${money(o.shipping)}</dd></div>
                <div><dt>GST included</dt><dd>${money(o.tax)}</dd></div>
                <div class="grand"><dt>Total</dt><dd>${money(o.total)}</dd></div></dl></div></section>
            <section class="card"><h2 class="card__title" style="margin-bottom:14px">History</h2><ul class="history">${[...o.history].reverse().map((h) => `<li><span><strong>${esc(h.status)}</strong> · ${esc(h.by)}${h.note ? ` · ${esc(h.note)}` : ""}<small>${fmtDateTime(h.at)}</small></span></li>`).join("")}</ul></section>
          </div>
          <div style="display:grid;gap:20px">
            <section class="card"><h2 class="card__title" style="margin-bottom:12px">Customer</h2><dl class="kv"><dd><strong>${esc(o.name)}</strong> ${o.customerId ? chip("account", "info") : chip("guest")}</dd><dd>${esc(o.email)} · ${esc(o.phone)}</dd>
              <dt style="margin-top:10px">Ship to</dt><dd>${esc(o.address.line1)}${o.address.line2 ? `, ${esc(o.address.line2)}` : ""}<br>${esc(o.address.city)}, ${esc(o.address.state)} ${esc(o.address.pincode)}</dd>
              <dt style="margin-top:10px">Delivery</dt><dd>${esc(o.shippingZone)} · est. ${esc(o.eta)}${o.trackingId ? `<br>${esc(o.courier)} · ${esc(o.trackingId)}` : ""}</dd>
              <dt style="margin-top:10px">Marketing consent</dt><dd>${o.marketingConsent ? "Yes" : "No"} (order updates are always sent)</dd></dl></section>
            <section class="card"><h2 class="card__title" style="margin-bottom:12px">Payments</h2>${pays.length ? `<ul class="history">${pays.map((p) => `<li><span>Attempt ${p.attempt} · ${chip(p.state, payTone(p.state))} · ${money(p.amount)}<small>${esc(p.method || "")} · ${esc(p.gatewayTxnId || "no transaction yet")} · ${fmtDateTime(p.createdAt)}</small></span></li>`).join("")}</ul>` : '<p class="muted">No payment attempts.</p>'}
              ${refunds.length ? `<h3 style="margin:14px 0 8px;font-size:14px">Refunds</h3><ul class="history">${refunds.map((r) => `<li><span>${money(r.amount)} · ${chip(r.state, r.state === "processed" ? "ok" : "warn")}<small>${esc(r.reason)}</small></span></li>`).join("")}</ul>` : ""}</section>
            <section class="card"><h2 class="card__title" style="margin-bottom:12px">Internal notes</h2>
              <ul class="history">${o.notes.map((n) => `<li><span>${esc(n.text)}<small>${esc(n.by)} · ${fmtDateTime(n.at)}</small></span></li>`).join("") || '<li style="display:block" class="muted">No notes.</li>'}</ul>
              <form data-note style="display:flex;gap:8px;margin-top:12px"><input class="input" name="text" placeholder="Add a note for the team" required><button class="mini-btn" type="submit">Add</button></form></section>
          </div>
        </div>`,
      mount(el) {
        $("[data-advance]", el)?.addEventListener("click", async (e) => {
          const to = e.currentTarget.dataset.advance;
          if (to === "Shipped") return shipSheet(o, e.currentTarget);
          if (to === "Returned" && !(await confirmDialog({ title: "Mark the return as received?", body: "Returned units go to quarantine for inspection, and a refund request is created for Finance.", confirm: "Mark received" }))) return;
          act(() => A.advanceOrder(o.id, to), `Order marked ${to.toLowerCase()}.`);
        });
        $("[data-slip]", el)?.addEventListener("click", () =>
          printDocument(`Packing slip ${o.id}`, `<h1>NIRAH</h1><h2>Packing slip · ${esc(o.id)}</h2><div class="grid"><div><strong>Ship to</strong><br>${esc(o.name)}<br>${esc(o.address.line1)}${o.address.line2 ? `<br>${esc(o.address.line2)}` : ""}<br>${esc(o.address.city)}, ${esc(o.address.state)} ${esc(o.address.pincode)}<br>${esc(o.phone)}</div><div><strong>Order date</strong> ${fmtDate(o.createdAt)}<br><strong>Zone</strong> ${esc(o.shippingZone)}</div></div>
            <table><thead><tr><th>✓</th><th>SKU</th><th>Item</th><th class="r">Qty</th></tr></thead><tbody>${o.lines.map((l) => `<tr><td>☐</td><td>${esc(l.sku)}</td><td>${esc(l.title)}</td><td class="r">${l.qty}</td></tr>`).join("")}</tbody></table><p class="muted" style="margin-top:20px">Picked by: __________ Packed by: __________</p>`)
        );
        $("[data-cancel]", el)?.addEventListener("click", async () => {
          const reason = await confirmDialog({ title: `Cancel ${o.id}?`, body: o.paymentState === "paid" ? "Allocated stock is released and a full refund request is created for Finance to process." : "Held stock is released. No payment was taken.", confirm: "Cancel order", danger: true, input: { label: "Reason (shared with the customer)", required: true } });
          if (reason) act(() => A.cancelOrder(o.id, reason), "Order cancelled.");
        });
        $$("[data-decline]", el).forEach((b) =>
          b.addEventListener("click", async () => {
            const note = await confirmDialog({ title: "Decline request", confirm: "Decline", input: { label: "Explain why (sent to the customer)", required: true } });
            if (note) act(() => A.declineRequest(o.id, b.dataset.decline, note), "Request declined.");
          })
        );
        $("[data-refund]", el)?.addEventListener("click", (e) => refundSheet(o, e.currentTarget));
        $("[data-note]", el).addEventListener("submit", (e) => {
          e.preventDefault();
          act(() => A.addNote(o.id, e.target.text.value), "Note added.");
        });
      },
    };
  }

  function shipSheet(o, origin) {
    const sheet = openSheet({
      title: `Ship ${o.id}`,
      side: "center",
      origin,
      html: `<form class="dialog" data-ship style="padding-top:0"><p class="dialog__body">Stock leaves the warehouse now: on-hand and allocated quantities both drop.</p>
        <label class="field"><span class="field__label">Courier</span><select name="courier"><option>Delhivery</option><option>Blue Dart</option><option>Ekart</option><option>India Post</option><option>Other</option></select></label>
        <label class="field"><span class="field__label">Tracking ID</span><input name="trackingId" required autofocus></label>
        <div class="dialog__actions"><button class="btn btn--ghost" type="button" data-close>Cancel</button><button class="btn btn--primary" type="submit">Mark shipped</button></div></form>`,
    });
    $("[data-ship]", sheet.el).addEventListener("submit", async (e) => {
      e.preventDefault();
      if (await act(() => A.advanceOrder(o.id, "Shipped", { courier: e.target.courier.value, trackingId: e.target.trackingId.value }), "Order shipped.")) sheet.close();
    });
  }

  function refundSheet(o, origin) {
    const done = db().refunds.filter((r) => r.orderId === o.id && r.state !== "rejected").reduce((s, r) => s + r.amount, 0);
    const sheet = openSheet({
      title: `Refund for ${o.id}`,
      side: "center",
      origin,
      html: `<form class="dialog" data-refund-form style="padding-top:0"><p class="dialog__body">Paid ${money(o.total)}. Already requested or refunded: ${money(done)}. Finance approves and processes refunds through the gateway.</p>
        <label class="field"><span class="field__label">Amount (₹)</span><input name="amount" type="number" step="0.01" min="1" max="${o.total - done}" value="${round2(o.total - done)}" required></label>
        <label class="field"><span class="field__label">Reason</span><input name="reason" required></label>
        <div class="dialog__actions"><button class="btn btn--ghost" type="button" data-close>Cancel</button><button class="btn btn--primary" type="submit">Request refund</button></div></form>`,
    });
    $("[data-refund-form]", sheet.el).addEventListener("submit", async (e) => {
      e.preventDefault();
      if (await act(() => A.requestRefund(o.id, e.target.amount.value, e.target.reason.value), "Refund requested.")) sheet.close();
    });
  }

  // ---------- Payments & refunds ----------
  views.payments = (_, q) => {
    const d = db();
    const tab = q.tab || "transactions";
    const tabs = [["transactions", "Transactions"], ["exceptions", `Exceptions (${exceptions().length})`], ["refunds", "Refunds"], ["webhooks", "Webhook log"]];
    let body = "";
    if (tab === "transactions") {
      const pays = [...d.payments].sort((a, b) => b.createdAt - a.createdAt);
      body = `<div class="card__head"><p class="muted">Gateway transactions recorded from verified webhooks. The browser's success page never marks an order paid on its own.</p><button class="mini-btn" type="button" data-export-recon>${icon("download")} Reconciliation CSV</button></div>
        ${table(["Payment", "Order", ">Attempt", "Method", ">Amount", "State", "Gateway transaction", "Created"], pays.slice(0, 300).map((p) => `<tr><td>${esc(p.id)}</td><td><a class="link" href="#/orders/${p.orderId}">${p.orderId}</a></td><td class="r">${p.attempt}</td><td>${esc(p.method || "")}</td><td class="r">${money(p.amount)}</td><td>${chip(p.state, payTone(p.state))}</td><td>${esc(p.gatewayTxnId || "—")}</td><td class="nowrap">${fmtDateTime(p.createdAt)}</td></tr>`))}`;
    } else if (tab === "exceptions") {
      const ex = exceptions();
      body = `<div class="card__head"><p class="muted">Orders whose payment needs a person: amount mismatches, payments that arrived after the stock hold expired, and confirmations stuck for more than 15 minutes.</p></div>
        ${table(["Order", "Problem", "Payment", ">Total", ""], ex.map((o) => `<tr><td><a class="link" href="#/orders/${o.id}">${o.id}</a><br><span class="muted">${fmtDateTime(o.createdAt)}</span></td><td>${esc(o.exception || (o.paymentState === "review" ? "Under review" : "Gateway says paid; no verified webhook yet"))}</td><td>${chip(o.paymentState, payTone(o.paymentState))}</td><td class="r">${money(o.total)}</td>
          <td><div class="actions">${A.can("payments.view") ? `<button class="mini-btn" type="button" data-resolve="${o.id}">Resolve</button>` : ""}${A.can("refunds.request") && o.paymentState === "paid" ? `<button class="mini-btn" type="button" data-refund-order="${o.id}">Refund</button>` : ""}</div></td></tr>`), "No exceptions. Every captured payment matches an order.")}`;
    } else if (tab === "refunds") {
      const list = [...d.refunds].sort((a, b) => b.createdAt - a.createdAt);
      const canApprove = A.can("refunds.approve");
      body = `<div class="card__head"><p class="muted">Refunds need Finance approval, then are sent to the gateway's refund API and reconciled.</p></div>
        ${table(["Refund", "Order", ">Amount", "Reason", "State", "Requested", "Gateway ref", ""], list.map((r) => `<tr><td>${esc(r.id)}</td><td><a class="link" href="#/orders/${r.orderId}">${r.orderId}</a></td><td class="r">${money(r.amount)}</td><td>${esc(r.reason)}</td><td>${chip(r.state, r.state === "processed" ? "ok" : r.state === "rejected" ? "bad" : "warn")}</td><td class="nowrap">${esc(r.requestedBy)}<br><span class="muted">${fmtDateTime(r.createdAt)}</span></td><td>${esc(r.gatewayRef || "—")}</td>
          <td><div class="actions">${canApprove && r.state === "requested" ? `<button class="mini-btn mini-btn--primary" type="button" data-refund-act="approve" data-id="${r.id}">Approve</button><button class="mini-btn" type="button" data-refund-act="reject" data-id="${r.id}">Reject</button>` : ""}${canApprove && r.state === "approved" ? `<button class="mini-btn mini-btn--primary" type="button" data-refund-act="process" data-id="${r.id}">Process via gateway</button>` : ""}</div></td></tr>`), "No refunds yet.")}`;
    } else {
      const events = d.webhookEvents;
      const sent = new Set(N.gateway.events().map((e) => e.eventId));
      body = `<div class="card__head"><p class="muted">Every gateway notification is checked against the shared signing secret and recorded. Replaying an event shows that duplicates never double-charge or double-allocate stock.</p></div>
        ${table(["Received", "Event", "Order", ">Amount", "Signature", "Outcome", ""], events.slice(0, 200).map((e) => `<tr><td class="nowrap">${fmtDateTime(e.receivedAt)}</td><td>${esc(e.type)}<br><span class="muted">${esc(e.id)}</span></td><td>${e.orderId ? `<a class="link" href="#/orders/${e.orderId}">${e.orderId}</a>` : "—"}</td><td class="r">${e.amount != null ? money(e.amount) : ""}</td><td>${e.signatureValid ? chip("valid", "ok") : chip("invalid", "bad")}</td><td>${esc(e.outcome)}</td>
          <td>${A.can("payments.view") && sent.has(e.id) ? `<button class="mini-btn" type="button" data-replay="${e.id}">${icon("refresh")} Replay</button>` : ""}</td></tr>`), "No webhooks received in this browser yet. Place an order on the store to see them arrive.")}`;
    }
    return {
      title: "Payments & Refunds",
      live: true,
      html: `<div class="tabs" role="tablist">${tabs.map(([k, l]) => `<a role="tab" href="#/payments?tab=${k}" aria-selected="${k === tab}">${l}</a>`).join("")}</div><section class="card card--flush">${body}</section>`,
      mount(el) {
        $("[data-export-recon]", el)?.addEventListener("click", () =>
          csv("payment-reconciliation.csv", ["Payment", "Order", "Attempt", "Method", "Amount", "State", "Gateway txn", "Order status", "Order payment state", "Refunded"], d.payments.map((p) => {
            const o = d.orders.find((x) => x.id === p.orderId);
            return [p.id, p.orderId, p.attempt, p.method, p.amount, p.state, p.gatewayTxnId, o?.status, o?.paymentState, sum(d.refunds.filter((r) => r.orderId === p.orderId && r.state === "processed").map((r) => r.amount))];
          }))
        );
        $$("[data-resolve]", el).forEach((b) =>
          b.addEventListener("click", async () => {
            const note = await confirmDialog({ title: "Resolve exception", confirm: "Mark resolved", input: { label: "What was done?", required: true } });
            if (note) act(() => A.resolveException(b.dataset.resolve, note), "Exception resolved.");
          })
        );
        $$("[data-refund-order]", el).forEach((b) => b.addEventListener("click", () => refundSheet(d.orders.find((o) => o.id === b.dataset.refundOrder), b)));
        $$("[data-refund-act]", el).forEach((b) => b.addEventListener("click", () => act(() => A.decideRefund(b.dataset.id, b.dataset.refundAct), `Refund ${b.dataset.refundAct === "process" ? "processed" : `${b.dataset.refundAct}d`}.`)));
        $$("[data-replay]", el).forEach((b) =>
          b.addEventListener("click", async () => {
            const res = await act(() => A.replayWebhook(b.dataset.replay));
            if (res) toast(`Replayed: ${res.outcome}`, "info");
          })
        );
      },
    };
  };

  // ---------- Discounts ----------
  views.discounts = (rest, q) => {
    if (rest[0]) return promoEditor(rest[0] === "new" ? null : rest[0]);
    const d = db();
    const scope = (p) => [...p.categoryIds.map((id) => S.catById(id)?.name), ...p.skus].filter(Boolean).join(", ") || "Whole basket";
    const items = d.promotions.filter((p) => !p.archived).sort((a, b) => b.startsAt - a.startsAt);
    return {
      title: "Discounts & Campaigns",
      live: true,
      html: `<p class="notice">${icon("info")} <span><strong>No stacking.</strong> Each item gets the single valid product, category or seasonal promotion with the lowest price, never below its price floor. Coupons only apply to items that aren't already discounted. The applied promotion and amount are saved on every order.</span></p>
        <section class="card card--flush"><div class="card__head"><h2 class="card__title">Promotions</h2>${A.can("discounts.edit") ? `<a class="btn btn--primary btn--sm" href="#/discounts/new">${icon("plus")} New promotion</a>` : ""}</div>
        ${table(["Name", "Type", "Value", "Applies to", "Window (IST)", "State", ">Used", ""], items.map((p) => {
          const state = S.promoState(p);
          return `<tr><td><strong>${esc(p.name)}</strong>${p.code ? `<br><code>${esc(p.code)}</code>` : ""}</td><td>${esc(p.type)}</td><td>${p.mode === "percent" ? `${p.value}%` : money(p.value)}</td><td>${esc(scope(p))}</td>
            <td class="nowrap">${fmtDateTime(p.startsAt)}<br><span class="muted">to ${fmtDateTime(p.endsAt)}</span></td><td>${chip(state, promoTone[state])}</td><td class="r">${p.used}${p.usageLimit ? ` / ${p.usageLimit}` : ""}</td>
            <td><div class="actions"><a class="mini-btn" href="#/discounts/${p.id}">${A.can("discounts.edit") ? "Edit" : "View"}</a>${A.can("discounts.edit") ? `<button class="mini-btn" type="button" data-toggle-promo="${p.id}">${p.active ? "Deactivate" : "Activate"}</button>` : ""}</div></td></tr>`;
        }))}</section>`,
      mount(el) {
        $$("[data-toggle-promo]", el).forEach((b) => {
          const p = db().promotions.find((x) => x.id === b.dataset.togglePromo);
          b.addEventListener("click", () => act(() => A.setPromotionFlag(p.id, "active", !p.active), p.active ? "Promotion deactivated." : "Promotion activated."));
        });
      },
    };
  };

  function promoEditor(id) {
    const d = db();
    const p = id ? d.promotions.find((x) => x.id === id) : null;
    const canEdit = A.can("discounts.edit");
    const now = Date.now();
    const x = p || { name: "", type: "campaign", mode: "percent", value: 10, skus: [], categoryIds: [], excludeSkus: [], startsAt: now, endsAt: now + 14 * DAY, active: false, code: "", minSpend: 0, usageLimit: 0, perCustomerLimit: 1, banner: "", image: "", public: true, allowBelowFloor: false };
    const dis = canEdit ? "" : "disabled";
    const products = d.products.filter((pp) => pp.status !== "archived");
    return {
      title: p ? p.name : "New promotion",
      mount: (el) => mountPromoEditor(el, p),
      html: `<form data-promo-form>
        <div class="statusbar"><a class="mini-btn" href="#/discounts">${icon("left")} Promotions</a>${p ? chip(S.promoState(p), promoTone[S.promoState(p)]) : ""}<span class="spacer"></span>${canEdit ? `<button class="btn btn--primary btn--sm" type="submit">${icon("check")} Save promotion</button>` : ""}</div>
        <div class="split" style="margin-top:20px">
          <section class="card"><div class="form-section"><h3>Promotion</h3><div class="form-grid">
            <label class="field"><span class="field__label">Name</span><input name="name" value="${esc(x.name)}" required ${dis}></label>
            <label class="field"><span class="field__label">Type</span><select name="type" ${dis}>${[["product", "Product markdown (SKU)"], ["category", "Category discount"], ["campaign", "Seasonal campaign"], ["coupon", "Coupon code"]].map(([k, l]) => `<option value="${k}" ${x.type === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
            <label class="field"><span class="field__label">Discount</span><select name="mode" ${dis}><option value="percent" ${x.mode === "percent" ? "selected" : ""}>Percentage off</option><option value="fixed" ${x.mode === "fixed" ? "selected" : ""}>Fixed ₹ off</option></select></label>
            <label class="field"><span class="field__label">Value</span><input name="value" type="number" min="0" step="0.01" value="${x.value}" required ${dis}></label>
            <label class="field"><span class="field__label">Starts (IST)</span><input name="startsAt" type="datetime-local" value="${toLocalInput(x.startsAt)}" required ${dis}></label>
            <label class="field"><span class="field__label">Ends (IST)</span><input name="endsAt" type="datetime-local" value="${toLocalInput(x.endsAt)}" required ${dis}></label>
            <label class="check span-2"><input type="checkbox" name="active" ${x.active ? "checked" : ""} ${dis}> <span>Active (runs automatically between the start and end times)</span></label>
          </div></div>
          <div class="form-section" data-show="coupon"><h3>Coupon rules</h3><div class="form-grid">
            <label class="field"><span class="field__label">Code</span><input name="code" value="${esc(x.code || "")}" style="text-transform:uppercase" ${dis}></label>
            <label class="field"><span class="field__label">Minimum spend on eligible items (₹)</span><input name="minSpend" type="number" min="0" value="${x.minSpend || 0}" ${dis}></label>
            <label class="field"><span class="field__label">Total usage limit (0 = none)</span><input name="usageLimit" type="number" min="0" value="${x.usageLimit || 0}" ${dis}></label>
            <label class="field"><span class="field__label">Uses per customer (0 = none)</span><input name="perCustomerLimit" type="number" min="0" value="${x.perCustomerLimit || 0}" ${dis}></label>
            <label class="check span-2"><input type="checkbox" name="public" ${x.public ? "checked" : ""} ${dis}> <span>Show this code on the Offers page</span></label></div></div>
          <div class="form-section" data-show="campaign"><h3>Campaign banner</h3><div class="form-grid">
            <label class="field span-2"><span class="field__label">Banner text</span><input name="banner" value="${esc(x.banner || "")}" ${dis}></label>
            <label class="field span-2"><span class="field__label">Banner image URL</span><input name="image" value="${esc(x.image || "")}" ${dis}></label></div></div>
          <div class="form-section"><h3>Eligibility</h3>
            <div data-show="category campaign coupon"><span class="field__label">Categories</span><div class="check-list">${d.categories.filter((c) => !c.archived).map((c) => `<label class="check"><input type="checkbox" name="categoryIds" value="${c.id}" ${x.categoryIds.includes(c.id) ? "checked" : ""} ${dis}> ${c.parentId ? "— " : ""}${esc(c.name)}</label>`).join("")}</div></div>
            <div data-show="product campaign coupon"><span class="field__label">Products (SKU)</span><input class="input" data-product-search placeholder="Filter products" style="margin:6px 0"><div class="check-list" data-product-list>${products.map((pp) => `<label class="check" data-name="${esc(pp.title.toLowerCase())} ${pp.sku.toLowerCase()}"><input type="checkbox" name="skus" value="${pp.sku}" ${x.skus.includes(pp.sku) ? "checked" : ""} ${dis}> ${esc(pp.title)} <span class="muted">${pp.sku}</span></label>`).join("")}</div></div>
            <div data-show="category campaign"><span class="field__label">Exclude SKUs</span><div class="check-list">${products.map((pp) => `<label class="check"><input type="checkbox" name="excludeSkus" value="${pp.sku}" ${x.excludeSkus.includes(pp.sku) ? "checked" : ""} ${dis}> ${esc(pp.title)}</label>`).join("")}</div></div>
            ${A.session().role === "owner" ? `<label class="check"><input type="checkbox" name="allowBelowFloor" ${x.allowBelowFloor ? "checked" : ""} ${dis}> <span>Owner override: allow prices below each product's floor</span></label>` : ""}
            <p class="field__error" data-errors></p>
          </div></section>
          <section class="card card--flush"><div class="card__head"><h2 class="card__title">Preview effective prices</h2><span class="muted" data-preview-count></span></div><div data-preview></div></section>
        </div></form>`,
    };
  }

  function mountPromoEditor(el, p) {
    editing = true;
    const form = $("[data-promo-form]", el);
    const collect = () => {
      const fd = new FormData(form);
      const parse = (v) => new Date(v).getTime();
      return {
        id: p?.id,
        name: fd.get("name"),
        type: fd.get("type"),
        mode: fd.get("mode"),
        value: Number(fd.get("value")),
        startsAt: parse(fd.get("startsAt")),
        endsAt: parse(fd.get("endsAt")),
        active: fd.get("active") === "on",
        code: String(fd.get("code") || "").trim().toUpperCase(),
        minSpend: Number(fd.get("minSpend")) || 0,
        usageLimit: Number(fd.get("usageLimit")) || 0,
        perCustomerLimit: Number(fd.get("perCustomerLimit")) || 0,
        public: fd.get("public") === "on",
        banner: fd.get("banner"),
        image: fd.get("image"),
        categoryIds: fd.getAll("categoryIds"),
        skus: fd.getAll("skus"),
        excludeSkus: fd.getAll("excludeSkus"),
        allowBelowFloor: fd.get("allowBelowFloor") === "on",
      };
    };
    const refresh = () => {
      const input = collect();
      $$("[data-show]", el).forEach((s) => (s.hidden = !s.dataset.show.split(" ").includes(input.type)));
      const errs = A.validatePromotion(input);
      $("[data-errors]", el).textContent = errs.join(" ");
      const rows = A.previewPromotion(input);
      $("[data-preview-count]", el).textContent = `${rows.length} product(s)`;
      $("[data-preview]", el).innerHTML =
        input.type === "coupon"
          ? `<p class="muted" style="padding:0 20px 20px">Coupons are applied in the cart to eligible items that aren't already discounted${input.minSpend ? `, once eligible items reach ${money(input.minSpend)}` : ""}.</p>`
          : table(["Product", ">Now", ">With this", "Note"], rows.map((r) => `<tr><td>${esc(r.p.title)}<br><span class="muted">${money(r.p.price)} regular</span></td><td class="r">${money(r.current)}</td><td class="r"><strong>${money(r.effective)}</strong></td><td>${r.floored ? chip("held at floor", "warn") : ""}${r.wins ? "" : chip("another offer is better", "info")}</td></tr>`), "Choose eligible products or categories to preview prices.");
    };
    form.addEventListener("input", refresh);
    form.addEventListener("change", refresh);
    $("[data-product-search]", el).addEventListener("input", (e) => {
      const t = e.target.value.toLowerCase();
      $$("[data-product-list] .check", el).forEach((c) => (c.hidden = t && !c.dataset.name.includes(t)));
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const saved = await act(() => A.savePromotion(collect()), "Promotion saved.");
      if (saved) {
        editing = false;
        location.hash = "#/discounts";
      }
    });
    refresh();
  }

  // ---------- Feedback ----------
  views.feedback = (_, q) => {
    const d = db();
    const tab = q.tab || "reviews";
    const canMod = A.can("feedback.moderate");
    let body = "";
    if (tab === "reviews") {
      const state = q.state ?? "pending";
      const list = d.reviews.filter((r) => !state || r.state === state).sort((a, b) => b.createdAt - a.createdAt);
      const byProduct = {};
      d.reviews.filter((r) => r.state === "approved").forEach((r) => ((byProduct[r.productId] = byProduct[r.productId] || []).push(r.rating)));
      const weak = Object.entries(byProduct).map(([pid, rs]) => [S.productById(pid), rs.reduce((s, v) => s + v, 0) / rs.length, rs.length]).filter(([, avg, n]) => avg < 3.8 && n >= 2);
      body = `${weak.length ? `<p class="notice notice--warn">${icon("alert")} <span><strong>Quality watch:</strong> ${weak.map(([pp, avg, n]) => `${esc(pp.title)} (${avg.toFixed(1)}★, ${n} reviews)`).join("; ")}. Consider checking remaining stock.</span></p>` : ""}
        <section class="card card--flush"><div class="card__head"><div class="toolbar-a">${[["pending", "Awaiting moderation"], ["approved", "Published"], ["rejected", "Rejected"], ["", "All"]].map(([k, l]) => `<a class="chip ${state === k ? "is-active" : ""}" href="#/feedback?tab=reviews&state=${k}">${l}</a>`).join("")}</div><button class="mini-btn" type="button" data-export-reviews>${icon("download")} CSV</button></div>
        <p class="muted" style="padding:0 20px 12px">Only verified buyers can review. Don't edit what a customer said or reject a review just because it is negative; reject only under the documented policy (abuse, spam, personal data).</p>
        ${table(["Product", "Rating", "Review", "Customer", "State", ""], list.slice(0, 200).map((r) => `<tr><td>${esc(S.productById(r.productId)?.title || "")}</td><td class="nowrap">${stars(r.rating)}</td><td style="max-width:380px"><strong>${esc(r.title)}</strong><br>${esc(r.body)}${r.reply ? `<br><span class="muted">Reply: ${esc(r.reply)}</span>` : ""}</td>
          <td>${esc(r.name)}<br><span class="muted">${r.orderId ? `<a class="link" href="#/orders/${r.orderId}">${r.orderId}</a> · ` : ""}${fmtDate(r.createdAt)}</span></td><td>${chip(r.state, r.state === "approved" ? "ok" : r.state === "rejected" ? "bad" : "warn")}</td>
          <td><div class="actions">${canMod && r.state !== "approved" ? `<button class="mini-btn mini-btn--primary" type="button" data-mod="approve" data-id="${r.id}">Approve</button>` : ""}${canMod && r.state !== "rejected" ? `<button class="mini-btn" type="button" data-mod="reject" data-id="${r.id}">Reject</button>` : ""}${canMod ? `<button class="mini-btn" type="button" data-reply="${r.id}">Reply</button>` : ""}<button class="mini-btn" type="button" data-history="${r.id}">History</button></div></td></tr>`), "No reviews here.")}</section>`;
    } else {
      const status = q.status ?? "";
      const list = d.cases.filter((c) => !status || c.status === status).sort((a, b) => b.createdAt - a.createdAt);
      const byTopic = d.cases.reduce((m, c) => ((m[c.topic] = (m[c.topic] || 0) + 1), m), {});
      body = `<div class="kpis">${["Open", "In Progress", "Resolved"].map((s) => `<a class="kpi" href="#/feedback?tab=cases&status=${encodeURIComponent(s)}"><span class="kpi__label">${s}</span><span class="kpi__value">${d.cases.filter((c) => c.status === s).length}</span></a>`).join("")}<div class="kpi"><span class="kpi__label">By topic</span><span class="kpi__sub">${Object.entries(byTopic).map(([k, v]) => `${k}: ${v}`).join(" · ")}</span></div></div>
        <section class="card card--flush"><div class="card__head"><div class="toolbar-a">${[["", "All"], ["Open", "Open"], ["In Progress", "In progress"], ["Resolved", "Resolved"]].map(([k, l]) => `<a class="chip ${status === k ? "is-active" : ""}" href="#/feedback?tab=cases&status=${encodeURIComponent(k)}">${l}</a>`).join("")}</div><button class="mini-btn" type="button" data-export-cases>${icon("download")} CSV</button></div>
        ${table(["Case", "Topic", "From", "Message", "Owner", "Status", ""], list.map((c) => `<tr><td>${esc(c.id)}<br><span class="muted">${fmtDateTime(c.createdAt)}</span></td><td>${esc(c.topic)}</td><td>${esc(c.name)}<br><span class="muted">${esc(c.email)}${c.orderId ? ` · ${esc(c.orderId)}` : ""}</span></td><td style="max-width:360px">${esc(c.message)}</td><td>${esc(c.owner || "Unassigned")}</td><td>${chip(c.status, c.status === "Resolved" ? "ok" : c.status === "Open" ? "warn" : "info")}</td><td><button class="mini-btn" type="button" data-case="${c.id}">Open</button></td></tr>`), "No cases.")}</section>`;
    }
    return {
      title: "Customer Feedback",
      live: true,
      html: `<div class="tabs" role="tablist"><a role="tab" href="#/feedback?tab=reviews" aria-selected="${tab === "reviews"}">Reviews (${d.reviews.filter((r) => r.state === "pending").length} waiting)</a><a role="tab" href="#/feedback?tab=cases" aria-selected="${tab === "cases"}">Support &amp; feedback (${d.cases.filter((c) => c.status !== "Resolved").length} open)</a></div>${body}`,
      mount(el) {
        $$("[data-mod]", el).forEach((b) =>
          b.addEventListener("click", async () => {
            let reason = "";
            if (b.dataset.mod === "reject") {
              reason = await confirmDialog({ title: "Reject review", body: "Record which policy rule this breaks. The decision is kept in the moderation history.", confirm: "Reject", danger: true, input: { label: "Policy reason", required: true } });
              if (!reason) return;
            }
            act(() => A.moderateReview(b.dataset.id, b.dataset.mod, reason), `Review ${b.dataset.mod === "approve" ? "published" : "rejected"}.`);
          })
        );
        $$("[data-reply]", el).forEach((b) =>
          b.addEventListener("click", async () => {
            const text = await confirmDialog({ title: "Public reply", confirm: "Post reply", input: { label: "Reply shown under the review", type: "textarea", required: true } });
            if (text) act(() => A.replyReview(b.dataset.reply, text), "Reply posted.");
          })
        );
        $$("[data-history]", el).forEach((b) => {
          const r = db().reviews.find((x) => x.id === b.dataset.history);
          b.addEventListener("click", () => openSheet({ title: "Moderation history", side: "right", origin: b, html: `<ul class="history">${r.moderation.map((m) => `<li><span><strong>${esc(m.action)}</strong> by ${esc(m.by)}${m.reason ? ` · ${esc(m.reason)}` : ""}<small>${fmtDateTime(m.at)}</small></span></li>`).join("") || '<li style="display:block" class="muted">No decisions yet.</li>'}</ul>` }));
        });
        $$("[data-case]", el).forEach((b) => b.addEventListener("click", () => caseSheet(db().cases.find((c) => c.id === b.dataset.case), b)));
        $("[data-export-reviews]", el)?.addEventListener("click", () => csv("reviews.csv", ["Review", "Product", "Rating", "Title", "Body", "Customer", "Order", "Created", "State"], db().reviews.map((r) => [r.id, S.productById(r.productId)?.title, r.rating, r.title, r.body, r.name, r.orderId, fmtDate(r.createdAt), r.state])));
        $("[data-export-cases]", el)?.addEventListener("click", () => csv("support-cases.csv", ["Case", "Topic", "Name", "Email", "Order", "Message", "Status", "Owner", "Created"], db().cases.map((c) => [c.id, c.topic, c.name, c.email, c.orderId, c.message, c.status, c.owner, fmtDateTime(c.createdAt)])));
      },
    };
  };

  function caseSheet(c, origin) {
    const templates = {
      "": "Choose a template…",
      thanks: "Thank you for getting in touch. We've passed your feedback to our team.",
      tracking: "We've checked with the courier: your parcel is moving and the tracking link will update within 24 hours.",
      product: "Thanks for your question. Here are the details from the product specification:",
      quality: "We're sorry about this. We've checked the remaining stock and will arrange a replacement or refund.",
    };
    const sheet = openSheet({
      title: `${c.id} · ${c.topic}`,
      side: "right",
      origin,
      html: `<div class="form-section"><p><strong>${esc(c.name)}</strong> · ${esc(c.email)}${c.orderId ? ` · <a class="link" href="#/orders/${esc(c.orderId)}">${esc(c.orderId)}</a>` : ""}<br><span class="muted">${fmtDateTime(c.createdAt)}</span></p>
        <p style="padding:14px;border-radius:12px;background:var(--surface);border:1px solid var(--line)">${esc(c.message)}</p>
        <ul class="history">${c.replies.map((r) => `<li><span>${esc(r.text)}<small>${esc(r.by)} · ${fmtDateTime(r.at)}</small></span></li>`).join("")}</ul>
        ${A.can("feedback.moderate") ? `<form class="form-section" data-case-form>
          <div class="form-grid"><label class="field"><span class="field__label">Status</span><select name="status">${["Open", "In Progress", "Resolved"].map((s) => `<option ${c.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></label>
          <label class="field"><span class="field__label">Owner</span><select name="owner"><option value="">Unassigned</option>${db().admins.filter((a) => a.active).map((a) => `<option ${c.owner === a.name ? "selected" : ""}>${esc(a.name)}</option>`).join("")}</select></label>
          <label class="field span-2"><span class="field__label">Category</span><select name="topic">${["product", "delivery", "suggestion", "other"].map((t) => `<option ${c.topic === t ? "selected" : ""}>${t}</option>`).join("")}</select></label></div>
          <label class="field"><span class="field__label">Templated response</span><select data-template>${Object.entries(templates).map(([k, v]) => `<option value="${k}">${esc(k ? v.slice(0, 60) + "…" : v)}</option>`).join("")}</select></label>
          <label class="field"><span class="field__label">Reply to customer (email sending is simulated)</span><textarea name="reply" rows="4"></textarea></label>
          <div class="sheet__foot"><button class="btn btn--primary" type="submit">Save</button></div></form>` : ""}</div>`,
    });
    $("[data-template]", sheet.el)?.addEventListener("change", (e) => {
      if (e.target.value) $("[name=reply]", sheet.el).value = templates[e.target.value];
    });
    $("[data-case-form]", sheet.el)?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      if (await act(() => A.updateCase(c.id, fd), "Case updated.")) sheet.close();
    });
  }

  // ---------- Customers ----------
  views.customers = (_, q) => {
    const d = db();
    const term = (q.q || "").toLowerCase();
    const byEmail = new Map();
    for (const c of d.customers) byEmail.set(c.email, { name: c.name, email: c.email, phone: c.phone, account: !!c.hash, consent: !!c.marketingConsent, orders: [], since: c.createdAt });
    for (const o of d.orders) {
      const row = byEmail.get(o.email) || { name: o.name, email: o.email, phone: o.phone, account: false, consent: !!o.marketingConsent, orders: [], since: o.createdAt };
      row.orders.push(o);
      byEmail.set(o.email, row);
    }
    const rows = [...byEmail.values()]
      .filter((r) => !term || `${r.name} ${r.email} ${r.phone}`.toLowerCase().includes(term))
      .map((r) => ({ ...r, spend: sum(r.orders.filter(isPaidSale).map((o) => o.total)), last: Math.max(0, ...r.orders.map((o) => o.createdAt)) }))
      .sort((a, b) => b.last - a.last);
    const canExport = A.can("customers.export");
    return {
      title: "Customers",
      live: true,
      html: `<section class="card card--flush"><div class="card__head"><form class="toolbar-a" data-filter><input class="input" name="q" value="${esc(q.q || "")}" placeholder="Name, email or phone" aria-label="Search customers"></form>
        <div class="toolbar-a"><button class="mini-btn" type="button" data-export="marketing" ${canExport ? "" : "disabled"}>${icon("download")} Marketing list (opted in)</button><button class="mini-btn" type="button" data-export="all" ${canExport ? "" : "disabled"}>${icon("download")} All customers</button></div></div>
        <p class="muted" style="padding:0 20px 12px">Customer data is restricted to roles that need it. Exports are owner-only, and the marketing list includes only people who opted in. No payment details are stored.</p>
        ${table(["Customer", "Contact", ">Orders", ">Paid spend", "Last order", "Marketing", ""], rows.slice(0, 300).map((r) => `<tr><td><strong>${esc(r.name)}</strong> ${r.account ? chip("account", "info") : chip("guest")}</td><td>${esc(r.email)}<br><span class="muted">${esc(r.phone || "")}</span></td><td class="r">${r.orders.length}</td><td class="r">${money(r.spend)}</td><td class="nowrap">${r.last ? fmtDate(r.last) : "—"}</td><td>${r.consent ? chip("opted in", "ok") : chip("no")}</td><td><button class="mini-btn" type="button" data-cust="${esc(r.email)}">Orders</button></td></tr>`), "No customers.")}</section>`,
      mount(el) {
        $("[data-filter]", el).addEventListener("submit", (e) => {
          e.preventDefault();
          location.hash = `#/customers?${qs({ q: e.target.q.value })}`;
        });
        $$("[data-export]", el).forEach((b) =>
          b.addEventListener("click", () => {
            const list = b.dataset.export === "marketing" ? rows.filter((r) => r.consent) : rows;
            csv(`customers-${b.dataset.export}.csv`, ["Name", "Email", "Phone", "Account", "Orders", "Paid spend", "Marketing consent"], list.map((r) => [r.name, r.email, r.phone, r.account ? "yes" : "guest", r.orders.length, r.spend, r.consent ? "yes" : "no"]));
          })
        );
        $$("[data-cust]", el).forEach((b) => {
          const r = rows.find((x) => x.email === b.dataset.cust);
          b.addEventListener("click", () => openSheet({ title: r.name, side: "right", origin: b, html: `<p class="muted">${esc(r.email)} · ${esc(r.phone || "")}</p>${r.orders.length ? `<ul class="history" style="margin-top:16px">${r.orders.sort((a, c) => c.createdAt - a.createdAt).map((o) => `<li><span><a class="link" href="#/orders/${o.id}" data-close>${o.id}</a> · ${esc(o.status)} · ${money(o.total)}<small>${fmtDate(o.createdAt)} · ${esc(o.lines.map((l) => l.title).join(", "))}</small></span></li>`).join("")}</ul>` : '<p class="muted">No orders.</p>'}` }));
        });
      },
    };
  };

  // ---------- Website content ----------
  views.content = () => {
    const d = db();
    const c = JSON.parse(JSON.stringify(d.content.draft));
    const changed = JSON.stringify(d.content.draft) !== JSON.stringify(d.content.published);
    const products = d.products.filter((p) => p.status === "published");
    const iconsList = ["shield", "box", "tag", "lock", "refresh", "truck", "leaf", "check"];
    return {
      title: "Website Content",
      mount: (el) => mountContent(el, c),
      html: `<form data-content-form>
        <div class="statusbar">${changed ? chip("Unpublished changes", "warn") : chip("Draft matches live site", "ok")}<span class="muted">Published ${fmtDateTime(d.content.publishedAt)}${d.content.draftSavedAt ? ` · draft saved ${fmtDateTime(d.content.draftSavedAt)}` : ""}</span><span class="spacer"></span>
          <button class="mini-btn" type="button" data-discard ${changed ? "" : "disabled"}>Discard draft</button>
          <button class="mini-btn" type="button" data-preview>${icon("eye")} Preview draft</button>
          <button class="mini-btn" type="submit">Save draft</button>
          <button class="btn btn--primary btn--sm" type="button" data-publish>Publish</button></div>
        <div class="grid-2" style="margin-top:20px">
          <section class="card"><div class="form-section"><h3>Hero</h3>
            <label class="field"><span class="field__label">Headline (two lines)</span><textarea name="hero.title" rows="2">${esc(c.hero.title)}</textarea></label>
            <label class="field"><span class="field__label">Intro text</span><textarea name="hero.text" rows="3">${esc(c.hero.text)}</textarea></label>
            <div class="form-grid"><label class="field"><span class="field__label">Primary button</span><input name="hero.primary" value="${esc(c.hero.primary)}"></label><label class="field"><span class="field__label">Secondary link</span><input name="hero.secondary" value="${esc(c.hero.secondary)}"></label></div></div>
            <div class="form-section"><h3>Promise strip</h3><div class="rows">${c.promises.map(([ic, text], i) => `<div class="row-edit"><select name="promise.icon.${i}">${iconsList.map((x) => `<option ${x === ic ? "selected" : ""}>${x}</option>`).join("")}</select><input name="promise.text.${i}" value="${esc(text.replace("\n", " / "))}"><span></span></div>`).join("")}</div><p class="field__hint">Use “ / ” to break the line. Keep claims factual.</p></div>
          </section>
          <section class="card"><div class="form-section"><h3>Homepage sections</h3><p class="field__hint">Order and visibility. Keep the homepage short.</p>
            <div class="rows" data-sections>${c.sections.map((s, i) => `<div class="row-edit" style="grid-template-columns:1fr auto auto" data-section="${s.key}"><label class="check"><input type="checkbox" name="section.${s.key}" ${s.visible ? "checked" : ""}> ${esc(s.label)}</label><button class="mini-btn" type="button" data-move="-1" ${i === 0 ? "disabled" : ""} aria-label="Move up">${icon("up")}</button><button class="mini-btn" type="button" data-move="1" ${i === c.sections.length - 1 ? "disabled" : ""} aria-label="Move down">${icon("down")}</button></div>`).join("")}</div></div>
            <div class="form-section"><h3>“Selected for you” products</h3><div class="check-list">${products.map((p) => `<label class="check"><input type="checkbox" name="pinned" value="${p.id}" ${c.pinned.includes(p.id) ? "checked" : ""}> ${esc(p.title)}</label>`).join("")}</div></div>
          </section>
          <section class="card"><div class="form-section"><h3>About NIRAH</h3>
            <label class="field"><span class="field__label">Title</span><input name="about.title" value="${esc(c.about.title)}"></label>
            <label class="field"><span class="field__label">Introduction</span><textarea name="about.intro" rows="3">${esc(c.about.intro)}</textarea></label>
            <label class="field"><span class="field__label">Story</span><textarea name="about.story" rows="4">${esc(c.about.story)}</textarea></label>
            <label class="field"><span class="field__label">Delivery commitment</span><textarea name="about.delivery" rows="3">${esc(c.about.delivery)}</textarea></label>
            ${c.about.standards.map(([h, p], i) => `<div class="row-edit"><input name="std.h.${i}" value="${esc(h)}"><input name="std.p.${i}" value="${esc(p)}"><span></span></div>`).join("")}</div></section>
          <section class="card"><div class="form-section"><h3>FAQs</h3><div class="rows" data-faqs>${c.faqs.map(([qq, a]) => `<div class="row-edit" data-faq style="grid-template-columns:1fr 1.6fr auto"><input data-k="q" value="${esc(qq)}"><input data-k="a" value="${esc(a)}"><button class="mini-btn mini-btn--danger" type="button" data-remove-faq>${icon("trash")}</button></div>`).join("")}</div>
            <button class="mini-btn" type="button" data-add-faq>${icon("plus")} Add FAQ</button></div>
            <div class="form-section"><h3>Policies</h3>${["shipping", "returns", "privacy", "terms"].map((k) => `<label class="field"><span class="field__label">${k[0].toUpperCase() + k.slice(1)}</span><textarea name="policy.${k}" rows="4">${esc(c.policies[k])}</textarea></label>`).join("")}</div></section>
        </div></form>`,
    };
  };

  function mountContent(el, c) {
    editing = true;
    const form = $("[data-content-form]", el);
    let order = c.sections.map((s) => s.key);
    $$("[data-move]", el).forEach((b) =>
      b.addEventListener("click", () => {
        const row = b.closest("[data-section]");
        const dir = Number(b.dataset.move);
        const sib = dir < 0 ? row.previousElementSibling : row.nextElementSibling;
        if (!sib) return;
        if (dir < 0) sib.before(row);
        else sib.after(row);
        order = $$("[data-section]", el).map((r) => r.dataset.section);
        $$("[data-section]", el).forEach((r, i, all) => {
          $('[data-move="-1"]', r).disabled = i === 0;
          $('[data-move="1"]', r).disabled = i === all.length - 1;
        });
      })
    );
    $("[data-add-faq]", el).addEventListener("click", () => {
      const tmp = document.createElement("div");
      tmp.innerHTML = `<div class="row-edit" data-faq style="grid-template-columns:1fr 1.6fr auto"><input data-k="q" placeholder="Question"><input data-k="a" placeholder="Answer"><button class="mini-btn mini-btn--danger" type="button" data-remove-faq>${icon("trash")}</button></div>`;
      $("[data-faqs]", el).append(tmp.firstElementChild);
    });
    el.addEventListener("click", (e) => e.target.closest("[data-remove-faq]")?.closest("[data-faq]").remove());
    const collect = () => {
      const fd = new FormData(form);
      const g = (k) => String(fd.get(k) ?? "");
      return {
        ...c,
        hero: { title: g("hero.title"), text: g("hero.text"), primary: g("hero.primary"), secondary: g("hero.secondary") },
        promises: c.promises.map((_, i) => [g(`promise.icon.${i}`), g(`promise.text.${i}`).replace(" / ", "\n")]),
        sections: order.map((key) => ({ ...c.sections.find((s) => s.key === key), visible: fd.get(`section.${key}`) === "on" })),
        pinned: fd.getAll("pinned"),
        about: { ...c.about, title: g("about.title"), intro: g("about.intro"), story: g("about.story"), delivery: g("about.delivery"), standards: c.about.standards.map((_, i) => [g(`std.h.${i}`), g(`std.p.${i}`)]) },
        faqs: $$("[data-faq]", el).map((r) => [$('[data-k="q"]', r).value.trim(), $('[data-k="a"]', r).value.trim()]).filter(([q2, a]) => q2 && a),
        policies: { shipping: g("policy.shipping"), returns: g("policy.returns"), privacy: g("policy.privacy"), terms: g("policy.terms") },
      };
    };
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (await act(() => A.saveContentDraft(collect()), "Draft saved.")) {
        editing = false;
        render({ keepScroll: true });
      }
    });
    $("[data-preview]", el).addEventListener("click", async () => {
      if (await act(() => A.saveContentDraft(collect()))) window.open("index.html?preview=draft#/", "_blank");
    });
    $("[data-publish]", el).addEventListener("click", async () => {
      if (!(await confirmDialog({ title: "Publish to the live site?", body: "Customers will see these changes immediately.", confirm: "Publish" }))) return;
      if ((await act(() => A.saveContentDraft(collect()))) && (await act(() => A.publishContent(), "Published."))) {
        editing = false;
        render({ keepScroll: true });
      }
    });
    $("[data-discard]", el).addEventListener("click", async () => {
      if (await confirmDialog({ title: "Discard draft changes?", confirm: "Discard", danger: true })) {
        await act(() => A.discardContentDraft(), "Draft discarded.");
        editing = false;
        render();
      }
    });
  }

  // ---------- Reports ----------
  views.reports = (_, q) => {
    const d = db();
    const tab = q.tab || "sales";
    const range = q.range || "30";
    const since = sinceFor(range);
    const orders = d.orders.filter((o) => o.createdAt >= since);
    const paid = orders.filter((o) => o.paymentState === "paid" || o.paymentState === "refunded");
    const refundsIn = d.refunds.filter((r) => r.state === "processed" && r.processedAt >= since);
    let head = [];
    let rows = [];
    let note = "";
    const lines = paid.filter((o) => o.status !== "Cancelled").flatMap((o) => o.lines.map((l) => ({ ...l, order: o })));
    if (tab === "sales") {
      const byDay = {};
      for (const o of orders) {
        const k = dayKey(o.createdAt);
        const r = (byDay[k] = byDay[k] || { orders: 0, units: 0, gross: 0, discounts: 0, cancelled: 0, refunded: 0 });
        if (o.status === "Cancelled") r.cancelled += o.paymentState === "refunded" || o.paymentState === "paid" ? o.total : 0;
        else if (o.paymentState === "paid" || o.paymentState === "refunded") {
          r.orders += 1;
          r.units += o.lines.reduce((s, l) => s + l.qty, 0);
          r.gross += o.total;
          r.discounts += o.autoDiscount + (o.coupon?.amount || 0);
        }
      }
      for (const rf of refundsIn) {
        const k = dayKey(rf.processedAt);
        (byDay[k] = byDay[k] || { orders: 0, units: 0, gross: 0, discounts: 0, cancelled: 0, refunded: 0 }).refunded += rf.amount;
      }
      head = ["Day (IST)", ">Paid orders", ">Units", ">Gross paid", ">Discounts given", ">Cancelled", ">Refunded", ">Net"];
      rows = Object.entries(byDay).sort(([a], [b]) => b.localeCompare(a)).map(([k, r]) => [k, r.orders, r.units, round2(r.gross), round2(r.discounts), round2(r.cancelled), round2(r.refunded), round2(r.gross - r.refunded)]);
      const gross = sum(rows.map((r) => r[3]));
      const count = sum(rows.map((r) => r[1]));
      note = `Gross paid ${money(gross)} · refunded ${money(sum(rows.map((r) => r[6])))} · average order value ${money(count ? gross / count : 0)}. Cancelled orders are excluded from gross; refunds are shown on the day they were processed.`;
    } else if (tab === "category" || tab === "product") {
      const groups = {};
      for (const l of lines) {
        const p = S.productById(l.productId);
        const key = tab === "category" ? S.catById(S.categoryChain(p?.categoryId || "").slice(-1)[0])?.name || "Unknown" : `${l.title} (${l.sku})`;
        const g = (groups[key] = groups[key] || { units: 0, revenue: 0, discount: 0 });
        g.units += l.qty;
        g.revenue += l.unit * l.qty - (l.couponShare || 0);
        g.discount += (l.regular - l.unit) * l.qty + (l.couponShare || 0);
      }
      head = [tab === "category" ? "Category" : "Product", ">Units sold", ">Revenue (incl. GST)", ">Discount cost"];
      rows = Object.entries(groups).sort((a, b) => b[1].revenue - a[1].revenue).map(([k, g]) => [k, g.units, round2(g.revenue), round2(g.discount)]);
      note = "Paid, non-cancelled orders in the period.";
    } else if (tab === "discounts") {
      const by = {};
      for (const l of lines) {
        if (l.promoId) {
          const g = (by[l.promoName] = by[l.promoName] || { lines: 0, cost: 0 });
          g.lines += l.qty;
          g.cost += (l.regular - l.unit) * l.qty;
        }
      }
      for (const o of paid.filter((x) => x.coupon && x.status !== "Cancelled")) {
        const g = (by[`Coupon ${o.coupon.code}`] = by[`Coupon ${o.coupon.code}`] || { lines: 0, cost: 0 });
        g.lines += 1;
        g.cost += o.coupon.amount;
      }
      head = ["Promotion", ">Units / orders", ">Discount cost"];
      rows = Object.entries(by).sort((a, b) => b[1].cost - a[1].cost).map(([k, g]) => [k, g.lines, round2(g.cost)]);
      note = "Cost of each promotion, taken from the promotion recorded on each order line.";
    } else if (tab === "stock") {
      head = ["SKU", "Product", ">Available", ">On hand", ">Reorder at", "Status", ">Days since receipt"];
      rows = d.products.filter((p) => p.status !== "archived").map((p) => {
        const st = S.stockOf(p.sku);
        return [p.sku, p.title, st.available, st.onHand, st.reorder, st.status === "out" ? "Out of stock" : st.status === "low" ? "Low" : "OK", st.lastReceipt ? Math.floor((Date.now() - st.lastReceipt) / DAY) : ""];
      }).sort((a, b) => a[2] - b[2]);
      note = "Stock ageing uses the last goods receipt date for each SKU.";
    } else if (tab === "best") {
      const days = Number(range === "today" ? 1 : range);
      head = ["Rank", "Product", ">Units (paid, minus returns)", ">Available"];
      rows = S.bestSellers({ windowDays: days, limit: 30, includeOutOfStock: true }).map((b, i) => [i + 1, `${b.product.title}${b.pinned ? " (pinned)" : ""}`, b.units, S.stockOf(b.product.sku).available]);
      note = `Same ranking as the store's Best Sellers page${d.settings.bestSellers.auto ? "" : " (automatic ranking is off: pinned products only)"}.`;
    } else if (tab === "returns") {
      const reasons = {};
      for (const o of orders) {
        if (o.status === "Cancelled") {
          const n = o.history.find((h) => h.status === "Cancelled")?.note || "Unspecified";
          reasons[`Cancelled: ${n}`] = (reasons[`Cancelled: ${n}`] || 0) + 1;
        }
        if (o.returnRequest) reasons[`Return: ${o.returnRequest.reason}`] = (reasons[`Return: ${o.returnRequest.reason}`] || 0) + 1;
      }
      head = ["Reason", ">Orders"];
      rows = Object.entries(reasons).sort((a, b) => b[1] - a[1]);
      note = "Cancellation and return reasons recorded in the period.";
    } else if (tab === "feedback") {
      const weeks = {};
      for (const r of d.reviews.filter((x) => x.createdAt >= since)) {
        const k = dayKey(r.createdAt - (new Date(r.createdAt).getDay() * DAY));
        const w = (weeks[k] = weeks[k] || { n: 0, total: 0, low: 0, cases: 0 });
        w.n += 1;
        w.total += r.rating;
        if (r.rating <= 2) w.low += 1;
      }
      for (const c of d.cases.filter((x) => x.createdAt >= since)) {
        const k = dayKey(c.createdAt - (new Date(c.createdAt).getDay() * DAY));
        (weeks[k] = weeks[k] || { n: 0, total: 0, low: 0, cases: 0 }).cases += 1;
      }
      head = ["Week starting", ">Reviews", ">Average rating", ">1–2 star", ">Support cases"];
      rows = Object.entries(weeks).sort(([a], [b]) => b.localeCompare(a)).map(([k, w]) => [k, w.n, w.n ? round2(w.total / w.n) : "", w.low, w.cases]);
      note = "All reviews submitted (including those awaiting moderation) and support cases opened.";
    } else if (tab === "recon") {
      head = ["Order", "Order payment", ">Order total", ">Captured", ">Refunded", "Check"];
      rows = orders.map((o) => {
        const cap = sum(d.payments.filter((p) => p.orderId === o.id && ["captured", "refunded", "partially refunded", "captured-duplicate"].includes(p.state)).map((p) => p.amount));
        const ref = sum(d.refunds.filter((r) => r.orderId === o.id && r.state === "processed").map((r) => r.amount));
        const ok = (o.paymentState === "paid" && cap === o.total) || (o.paymentState === "refunded" && cap === o.total) || (!["paid", "refunded"].includes(o.paymentState) && cap === 0);
        return [o.id, o.paymentState, o.total, cap, ref, ok ? "OK" : "Mismatch"];
      }).sort((a, b) => (a[5] === "Mismatch" ? -1 : 1) - (b[5] === "Mismatch" ? -1 : 1));
      note = "Compares what the gateway captured with what each order expects. Mismatches go to the Payments exception queue.";
    }
    const tabs = [["sales", "Sales by day"], ["category", "By category"], ["product", "By product"], ["discounts", "Discount cost"], ["stock", "Stock"], ["best", "Best sellers"], ["returns", "Cancellations & returns"], ["feedback", "Feedback trends"], ["recon", "Reconciliation"]];
    const fmt = (v, h) => (h.startsWith(">") && typeof v === "number" && /revenue|gross|discount|cancelled|refunded|net|captured|total|cost/i.test(h) ? money(v) : esc(v));
    return {
      title: "Reports",
      html: `<div class="toolbar-a"><div class="tabs" role="tablist">${tabs.map(([k, l]) => `<a role="tab" href="#/reports?${qs({ tab: k, range })}" aria-selected="${k === tab}">${l}</a>`).join("")}</div></div>
        <section class="card card--flush"><div class="card__head"><div class="toolbar-a">${[["7", "7 days"], ["30", "30 days"], ["90", "90 days"]].map(([k, l]) => `<a class="chip ${range === k ? "is-active" : ""}" href="#/reports?${qs({ tab, range: k })}">${l}</a>`).join("")}<span class="muted">All dates in IST (Asia/Kolkata)</span></div>
          <button class="mini-btn" type="button" data-csv>${icon("download")} Download CSV</button></div>
          <p class="muted" style="padding:0 20px 12px">${esc(note)}</p>
          ${table(head, rows.map((r) => `<tr>${r.map((v, i) => `<td class="${head[i].startsWith(">") ? "r" : ""}">${fmt(v, head[i])}</td>`).join("")}</tr>`), "No data for this period.")}</section>`,
      mount(el) {
        $("[data-csv]", el).addEventListener("click", () => csv(`nirah-${tab}-${range}d.csv`, head.map((h) => h.replace(/^>/, "")), rows));
      },
    };
  };

  // ---------- Settings ----------
  views.settings = () => {
    const s = db().settings;
    const zones = s.shipping.zones;
    return {
      title: "Settings",
      mount(el) {
        editing = true;
        const form = $("[data-settings]", el);
        form.addEventListener("submit", async (e) => {
          e.preventDefault();
          const fd = new FormData(form);
          const g = (k) => String(fd.get(k) ?? "").trim();
          const n = (k) => Number(fd.get(k));
          const patch = {
            business: { ...s.business, name: g("b.name"), email: g("b.email"), phone: g("b.phone"), address: g("b.address"), gstin: g("b.gstin"), hours: g("b.hours") },
            taxClasses: Object.fromEntries(Object.entries(s.taxClasses).map(([k, t]) => [k, { label: `${t.label.split(" ")[0]} ${n(`tax.${k}`)}%`.replace("exempt 0%", "exempt"), rate: n(`tax.${k}`) }])),
            shipping: {
              zones: zones.map((z, i) => ({ ...z, name: g(`z.name.${i}`), prefixes: g(`z.pre.${i}`).split(",").map((x) => x.trim()).filter(Boolean), fee: n(`z.fee.${i}`), freeAbove: n(`z.free.${i}`), eta: g(`z.eta.${i}`) })),
              blockedPrefixes: g("blocked").split(",").map((x) => x.trim()).filter(Boolean),
            },
            reservationMinutes: Math.max(2, n("reservationMinutes")),
            orderMinimum: Math.max(0, n("orderMinimum")),
            checkoutBanner: g("checkoutBanner"),
            paymentMethods: { upi: fd.get("pm.upi") === "on", card: fd.get("pm.card") === "on", netbanking: fd.get("pm.netbanking") === "on", wallet: fd.get("pm.wallet") === "on" },
            lowStockDefault: Math.max(0, n("lowStockDefault")),
            priceFloorPercent: Math.min(100, Math.max(0, n("priceFloorPercent"))),
            returnWindowDays: Math.max(0, n("returnWindowDays")),
            newArrivalDays: Math.max(1, n("newArrivalDays")),
            bestSellers: { auto: fd.get("bs.auto") === "on", windowDays: n("bs.window"), topN: n("bs.top"), deductReturns: fd.get("bs.returns") === "on" },
            searchSynonyms: Object.fromEntries(g("synonyms").split("\n").map((line) => line.split(":")).filter((p) => p.length === 2).map(([k, v]) => [k.trim().toLowerCase(), v.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean)])),
            promotedSearch: Object.fromEntries(g("promoted").split("\n").map((line) => line.split(":")).filter((p) => p.length === 2).map(([k, v]) => [k.trim().toLowerCase(), v.split(",").map((x) => x.trim()).filter(Boolean)])),
            gateway: { ...s.gateway, webhookSecret: g("secret") || s.gateway.webhookSecret },
          };
          if (!Object.values(patch.paymentMethods).some(Boolean)) return toast("Keep at least one payment method enabled.", "error");
          if (await act(() => A.saveSettings(patch), "Settings saved and logged.")) {
            editing = false;
            render({ keepScroll: true });
          }
        });
        $("[data-reset]", el).addEventListener("click", async () => {
          if (await confirmDialog({ title: "Reset all demo data?", body: "Every order, product change, account and setting in this browser returns to the original demo state.", confirm: "Reset", danger: true })) S.reset();
        });
      },
      html: `<form data-settings>
        <div class="statusbar"><span class="muted">Changes apply immediately and are recorded in the audit log.</span><span class="spacer"></span><button class="btn btn--primary btn--sm" type="submit">${icon("check")} Save settings</button></div>
        <div class="grid-2" style="margin-top:20px">
          <section class="card"><div class="form-section"><h3>Business and legal details</h3><div class="form-grid">
            <label class="field span-2"><span class="field__label">Legal name</span><input name="b.name" value="${esc(s.business.name)}"></label>
            <label class="field"><span class="field__label">Support email</span><input name="b.email" value="${esc(s.business.email)}"></label>
            <label class="field"><span class="field__label">Phone</span><input name="b.phone" value="${esc(s.business.phone)}"></label>
            <label class="field span-2"><span class="field__label">Registered address</span><input name="b.address" value="${esc(s.business.address)}"></label>
            <label class="field"><span class="field__label">GSTIN</span><input name="b.gstin" value="${esc(s.business.gstin)}"></label>
            <label class="field"><span class="field__label">Support hours</span><input name="b.hours" value="${esc(s.business.hours)}"></label></div></div>
            <div class="form-section"><h3>Tax classes (GST % included in prices)</h3><div class="form-grid">${Object.entries(s.taxClasses).map(([k, t]) => `<label class="field"><span class="field__label">${esc(k)}</span><input name="tax.${k}" type="number" min="0" max="40" value="${t.rate}"></label>`).join("")}</div></div>
            <div class="form-section"><h3>Checkout</h3><div class="form-grid">
              <label class="field"><span class="field__label">Stock hold while paying (minutes)</span><input name="reservationMinutes" type="number" min="2" value="${s.reservationMinutes}"></label>
              <label class="field"><span class="field__label">Order minimum (₹, 0 = none)</span><input name="orderMinimum" type="number" min="0" value="${s.orderMinimum}"></label>
              <label class="field span-2"><span class="field__label">Checkout banner</span><input name="checkoutBanner" value="${esc(s.checkoutBanner)}"></label>
              <span class="field__label span-2">Payment methods offered</span>
              ${["upi", "card", "netbanking", "wallet"].map((m) => `<label class="check"><input type="checkbox" name="pm.${m}" ${s.paymentMethods[m] ? "checked" : ""}> ${m === "netbanking" ? "Net banking" : m.toUpperCase().replace("WALLET", "Wallets").replace("CARD", "Cards")}</label>`).join("")}</div></div>
          </section>
          <section class="card"><div class="form-section"><h3>Shipping zones (pincode prefixes)</h3>
            ${zones.map((z, i) => `<div class="form-grid" style="padding-bottom:12px;border-bottom:1px solid var(--line)"><label class="field"><span class="field__label">Zone name</span><input name="z.name.${i}" value="${esc(z.name)}"></label><label class="field"><span class="field__label">Estimated delivery</span><input name="z.eta.${i}" value="${esc(z.eta)}"></label>
              <label class="field span-2"><span class="field__label">Pincode prefixes (comma separated; longest match wins)</span><input name="z.pre.${i}" value="${esc(z.prefixes.join(", "))}"></label>
              <label class="field"><span class="field__label">Fee (₹)</span><input name="z.fee.${i}" type="number" min="0" value="${z.fee}"></label><label class="field"><span class="field__label">Free above (₹)</span><input name="z.free.${i}" type="number" min="0" value="${z.freeAbove}"></label></div>`).join("")}
            <label class="field"><span class="field__label">Not serviceable (prefixes)</span><input name="blocked" value="${esc(s.shipping.blockedPrefixes.join(", "))}"></label></div>
            <div class="form-section"><h3>Catalogue rules</h3><div class="form-grid">
              <label class="field"><span class="field__label">Default low-stock threshold</span><input name="lowStockDefault" type="number" min="0" value="${s.lowStockDefault}"></label>
              <label class="field"><span class="field__label">Price floor (% of regular price)</span><input name="priceFloorPercent" type="number" min="0" max="100" value="${s.priceFloorPercent}"></label>
              <label class="field"><span class="field__label">Return window (days)</span><input name="returnWindowDays" type="number" min="0" value="${s.returnWindowDays}"></label>
              <label class="field"><span class="field__label">“New” badge for (days)</span><input name="newArrivalDays" type="number" min="1" value="${s.newArrivalDays}"></label></div></div>
            <div class="form-section"><h3>Best sellers</h3><div class="form-grid">
              <label class="check"><input type="checkbox" name="bs.auto" ${s.bestSellers.auto ? "checked" : ""}> Automatic ranking</label>
              <label class="check"><input type="checkbox" name="bs.returns" ${s.bestSellers.deductReturns ? "checked" : ""}> Deduct returns</label>
              <label class="field"><span class="field__label">Ranking window</span><select name="bs.window">${[7, 30, 90].map((dd) => `<option value="${dd}" ${s.bestSellers.windowDays === dd ? "selected" : ""}>${dd} days</option>`).join("")}</select></label>
              <label class="field"><span class="field__label">Top N shown</span><input name="bs.top" type="number" min="1" max="24" value="${s.bestSellers.topN}"></label></div></div>
            <div class="form-section"><h3>Search</h3>
              <label class="field"><span class="field__label">Synonyms (one per line: word: alt1, alt2)</span><textarea name="synonyms" rows="4">${esc(Object.entries(s.searchSynonyms).map(([k, v]) => `${k}: ${v.join(", ")}`).join("\n"))}</textarea></label>
              <label class="field"><span class="field__label">Promoted results (query: productId, …)</span><textarea name="promoted" rows="2">${esc(Object.entries(s.promotedSearch).map(([k, v]) => `${k}: ${v.join(", ")}`).join("\n"))}</textarea></label></div>
          </section>
          <section class="card"><div class="form-section"><h3>Payment gateway</h3><p class="muted">Provider: ${esc(s.gateway.provider)} · Key ID ${esc(s.gateway.keyId)}</p>
            <label class="field"><span class="field__label">Webhook signing secret</span><input name="secret" type="password" placeholder="•••••••• (unchanged)" autocomplete="off"><span class="field__hint">Changing this without updating the gateway makes every webhook fail verification, so orders stay unpaid. Useful for testing signature checks.</span></label></div>
            <div class="form-section"><h3>Security</h3><p class="muted">Roles and permissions are enforced on every action. Multi-factor sign-in, rate limiting at the network edge, backups and server-side sessions need a real backend and are not part of this browser prototype.</p></div>
            <div class="form-section"><h3>Demo data</h3><button class="btn btn--danger btn--sm" type="button" data-reset>Reset demo data</button></div>
          </section>
        </div></form>`,
    };
  };

  // ---------- Users & audit ----------
  views.users = (_, q) => {
    const d = db();
    const tab = q.tab || (A.can("users.manage") ? "users" : "audit");
    const tabs = [...(A.can("users.manage") ? [["users", "Users"], ["roles", "Roles & permissions"]] : []), ["audit", "Audit log"]];
    let body = "";
    if (tab === "users") {
      body = `<section class="card card--flush"><div class="card__head"><p class="muted">Give each person the narrowest role they need.</p><button class="btn btn--primary btn--sm" type="button" data-new-user>${icon("plus")} Add user</button></div>
        ${table(["Name", "Email", "Role", "Status", ""], d.admins.map((u) => `<tr><td><strong>${esc(u.name)}</strong></td><td>${esc(u.email)}</td><td>${esc(A.ROLES[u.role]?.label)}</td><td>${chip(u.active ? "active" : "disabled", u.active ? "ok" : "bad")}</td><td><div class="actions"><button class="mini-btn" type="button" data-edit-user="${u.id}">Edit</button></div></td></tr>`))}</section>`;
    } else if (tab === "roles") {
      const perms = ["products.edit", "products.price", "products.publish", "categories.edit", "inventory.adjust", "orders.update", "payments.view", "refunds.request", "refunds.approve", "discounts.edit", "feedback.moderate", "customers.view", "customers.export", "content.edit", "reports.view", "settings.edit", "users.manage", "audit.view"];
      body = `<section class="card card--flush"><div class="table-wrap"><table class="t perm-matrix"><thead><tr><th>Permission</th>${Object.values(A.ROLES).map((r) => `<th>${esc(r.label)}</th>`).join("")}</tr></thead><tbody>
        ${perms.map((p) => `<tr><td>${esc(p)}</td>${Object.keys(A.ROLES).map((k) => `<td>${A.ROLES[k].perms.includes("*") || A.ROLES[k].perms.includes(p) ? `<span class="yes">${icon("check")}</span>` : '<span class="no">—</span>'}</td>`).join("")}</tr>`).join("")}
        </tbody></table></div></section>`;
    } else {
      const events = [...new Set(d.audit.map((a) => a.event.split(".")[0]))].sort();
      const list = d.audit.filter((a) => (!q.event || a.event.startsWith(q.event)) && (!q.user || a.userId === q.user));
      body = `<section class="card card--flush"><div class="card__head"><form class="toolbar-a" data-audit-filter>
          <select class="select" name="event"><option value="">All events</option>${events.map((e) => `<option ${q.event === e ? "selected" : ""}>${e}</option>`).join("")}</select>
          <select class="select" name="user"><option value="">All users</option>${d.admins.map((u) => `<option value="${u.id}" ${q.user === u.id ? "selected" : ""}>${esc(u.name)}</option>`).join("")}</select></form>
          <button class="mini-btn" type="button" data-export-audit>${icon("download")} CSV</button></div>
        ${table(["When", "User", "Event", "Record", "Before", "After"], list.slice(0, 400).map((a) => `<tr><td class="nowrap">${fmtDateTime(a.at)}</td><td>${esc(a.userName)}<br><span class="muted">${esc(A.ROLES[a.role]?.label || a.role)}</span></td><td>${esc(a.event)}</td><td>${esc(a.entity)} ${esc(a.entityId)}</td><td><div class="json">${esc(a.before ? JSON.stringify(a.before) : "—")}</div></td><td><div class="json">${esc(a.after ? JSON.stringify(a.after) : "—")}</div></td></tr>`), "No audit events.")}</section>`;
    }
    return {
      title: "Users & Audit Log",
      live: true,
      html: `<div class="tabs" role="tablist">${tabs.map(([k, l]) => `<a role="tab" href="#/users?tab=${k}" aria-selected="${k === tab}">${l}</a>`).join("")}</div>${body}`,
      mount(el) {
        const af = $("[data-audit-filter]", el);
        af?.addEventListener("change", () => (location.hash = `#/users?${qs({ tab: "audit", ...Object.fromEntries(new FormData(af)) })}`));
        $("[data-export-audit]", el)?.addEventListener("click", () => csv("audit-log.csv", ["When (IST)", "User", "Role", "Event", "Entity", "Record", "Before", "After"], db().audit.map((a) => [fmtDateTime(a.at), a.userName, a.role, a.event, a.entity, a.entityId, JSON.stringify(a.before), JSON.stringify(a.after)])));
        $("[data-new-user]", el)?.addEventListener("click", (e) => userSheet(null, e.currentTarget));
        $$("[data-edit-user]", el).forEach((b) => b.addEventListener("click", () => userSheet(db().admins.find((u) => u.id === b.dataset.editUser), b)));
      },
    };
  };

  function userSheet(u, origin) {
    const sheet = openSheet({
      title: u ? `Edit ${u.name}` : "Add user",
      side: "right",
      origin,
      html: `<form class="form-section" data-user-form>
        <label class="field"><span class="field__label">Name</span><input name="name" value="${esc(u?.name || "")}" required></label>
        <label class="field"><span class="field__label">Email</span><input name="email" type="email" value="${esc(u?.email || "")}" required></label>
        <label class="field"><span class="field__label">Role</span><select name="role">${Object.entries(A.ROLES).map(([k, r]) => `<option value="${k}" ${u?.role === k ? "selected" : ""}>${esc(r.label)}</option>`).join("")}</select></label>
        <label class="field"><span class="field__label">${u ? "New password (leave blank to keep)" : "Temporary password"}</span><input name="password" type="password" minlength="8" autocomplete="new-password" ${u ? "" : "required"}></label>
        <label class="check"><input type="checkbox" name="active" ${!u || u.active ? "checked" : ""}> Account active</label>
        <div class="sheet__foot"><button class="btn btn--primary" type="submit">Save user</button></div></form>`,
    });
    $("[data-user-form]", sheet.el).addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      if (await act(() => A.saveAdmin({ id: u?.id, ...fd, active: fd.active === "on" }), "User saved.")) sheet.close();
    });
  }

  // ---------- Boot ----------
  window.addEventListener("hashchange", () => render());
  S.ready.then(() => {
    if (!location.hash) history.replaceState(null, "", "#/dashboard");
    render();
  });
  void num;
})();
