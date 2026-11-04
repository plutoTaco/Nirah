// NIRAH storefront: hash router, header and footer, and every customer page.
// Pages are rendered from the store; anything that changes money or stock
// goes through store functions that re-validate it.
(() => {
  const N = window.Nirah;
  const S = N.store;
  const M = N.motion || { enabled: false };
  const { esc, money, icon, imgUrl, fmtDate, fmtDateTime, stars, toast, openSheet, confirmDialog, debounce, logoMark, EASE, SPRING, reduceMotion, createSpring, rubberband, project, velocityTracker, printDocument, num } = N.ui;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const main = $("#main");
  const headerEl = $("#site-header");
  const footerEl = $("#site-footer");
  const DAY = 86400000;
  const params = new URLSearchParams(location.search);
  const previewing = () => params.get("preview") === "draft" && !!S.admin.session();
  const site = () => S.content(previewing());

  let cleanup = [];
  let motionRevert = null;
  let view = null;
  let firstRender = true;

  // ---------- Small components ----------
  const arrow = () => icon("arrow");
  const stockText = (st) => (st.status === "out" ? "Out of stock" : st.status === "low" ? `Only ${st.available} left` : "In stock");
  const stockHtml = (st) => `<span class="stock stock--${st.status}">${stockText(st)}</span>`;
  const priceHtml = (pr) => `${money(pr.price)}${pr.saving ? ` <s>${money(pr.regular)}</s>` : ""}`;
  const catName = (id) => S.catById(id)?.name || "";
  const qs = (obj) =>
    new URLSearchParams(Object.entries(obj).filter(([, v]) => v !== "" && v != null && v !== false && !(Array.isArray(v) && !v.length)).map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : v])).toString();
  const list = (v) => (v ? String(v).split(",").filter(Boolean) : []);
  const endsIn = (t) => {
    const days = Math.ceil((t - Date.now()) / DAY);
    return days <= 1 ? "Ends today" : `Ends ${fmtDate(t)}`;
  };

  function stepper(value, max, extra = "") {
    const m = Math.max(1, max);
    return `<div class="stepper ${extra.includes("sm") ? "stepper--sm" : ""}" data-stepper>
      <button type="button" data-step="-1" aria-label="Decrease quantity" ${value <= 1 ? "disabled" : ""}>${icon("minus")}</button>
      <input type="number" inputmode="numeric" min="1" max="${m}" value="${Math.min(value, m)}" aria-label="Quantity" ${extra.replace("sm", "")}>
      <button type="button" data-step="1" aria-label="Increase quantity" ${value >= m ? "disabled" : ""}>${icon("plus")}</button>
    </div>`;
  }

  function productCard(p, { rank } = {}) {
    const pr = S.pricing(p);
    const st = S.stockOf(p.sku);
    const rs = S.ratingSummary(p.id);
    const out = st.available <= 0;
    const badges = out
      ? '<span class="badge badge--muted">Out of stock</span>'
      : `${pr.percent ? `<span class="badge badge--sale">−${pr.percent}%</span>` : ""}${S.isNew(p) ? '<span class="badge badge--new">New</span>' : ""}`;
    return `<li class="product ${out ? "is-out" : ""}" data-flip-id="${esc(p.sku)}">
      <div class="product__media">
        <a href="#/p/${p.slug}" tabindex="-1" aria-hidden="true"><img src="${imgUrl(p.images[0], 560, 700)}" alt="${esc(p.images[0]?.alt)}" width="560" height="700" loading="lazy" decoding="async"></a>
        ${badges ? `<span class="product__badges">${badges}</span>` : ""}
        ${rank ? `<span class="product__rank" aria-label="Rank ${rank}">${rank}</span>` : ""}
        <button class="product__quick" type="button" data-quick="${p.slug}" aria-label="Quick view: ${esc(p.title)}">${icon("eye")}</button>
      </div>
      <div class="product__info">
        <p class="product__cat">${esc(catName(p.categoryId))}</p>
        <h3 class="product__name"><a href="#/p/${p.slug}">${esc(p.title)}</a></h3>
        <p class="product__attr">${esc(p.short)}</p>
        <p class="product__meta">
          ${rs.count ? `<span class="product__rating">${icon("star")} ${rs.avg.toFixed(1)} <span>(${rs.count})</span></span>` : ""}
          ${stockHtml(st)}
        </p>
        <div class="product__buy">
          <p class="product__price">${priceHtml(pr)}</p>
          <button class="product__add" type="button" data-add="${p.sku}" ${out ? "disabled" : ""} aria-label="${out ? `${esc(p.title)} is out of stock` : `Add ${esc(p.title)} to cart`}">${icon(out ? "close" : "plus")}</button>
        </div>
      </div>
    </li>`;
  }
  const grid = (products, cls = "", ranked = false) =>
    `<ul class="products ${cls}" data-reveal-group>${products.map((p, i) => productCard(p, ranked ? { rank: i + 1 } : {})).join("")}</ul>`;

  // Section heads read like a magazine's running order: a hairline rule, a
  // mono index and overline, then the serif title.
  const sectionHead = ({ eyebrow, title, lede, aside = "", no = "", id = "" }) => `
    <div class="section-head" data-reveal>
      <span class="section-head__rule" aria-hidden="true"></span>
      <div class="section-head__main">
        <p class="overline">${no ? `<span class="overline__no">${no}</span>` : ""}${esc(eyebrow)}</p>
        <h2 class="section-title"${id ? ` id="${id}"` : ""}>${esc(title)}</h2>
      </div>
      ${lede || aside ? `<div class="section-head__aside">${lede ? `<p class="section-lede">${esc(lede)}</p>` : ""}${aside}</div>` : ""}
    </div>`;

  const crumbs = (items) =>
    `<nav class="crumbs" aria-label="Breadcrumb">${items
      .map(([label, href], i) => (i < items.length - 1 ? `<a href="${href}">${esc(label)}</a><span aria-hidden="true">/</span>` : `<span aria-current="page">${esc(label)}</span>`))
      .join("")}</nav>`;

  const emptyState = (iconName, title, text, cta = "") =>
    `<div class="empty">${icon(iconName)}<h2>${esc(title)}</h2><p>${text}</p>${cta}</div>`;

  // ---------- Header, tab bar, mega menu, footer ----------
  // Phones get a tab bar for the five top-level places; wider windows keep
  // the same places in the top bar. Tabs navigate; they never open sheets.
  const TABS = [
    ["/", "home", "Home", (p) => p === "/"],
    ["/shop", "grid", "Shop", (p) => /^\/(shop|c\/|p\/|new|best-sellers|offers)/.test(p)],
    ["/search", "search", "Search", (p) => p.startsWith("/search")],
    ["/cart", "bag", "Cart", (p) => /^\/(cart|checkout)/.test(p)],
    ["/account", "user", "Account", (p) => /^\/(account|order|track)/.test(p)],
  ];
  const tabbarEl = document.createElement("nav");
  tabbarEl.className = "tabbar";
  tabbarEl.setAttribute("aria-label", "Sections");

  function renderHeader() {
    headerEl.innerHTML = `<div class="site-header__inner">
      <a class="brand" href="#/" aria-label="NIRAH home">${logoMark()}<span class="brand__name">NIRAH</span></a>
      <nav class="mainnav" aria-label="Main">
        <a href="#/shop" data-nav="/shop">Shop All</a>
        <div class="mainnav__cats">
          <button type="button" data-cats aria-expanded="false" aria-controls="megamenu">Categories ${icon("down")}</button>
          <div class="megamenu" id="megamenu" hidden></div>
        </div>
        <a href="#/new" data-nav="/new">New Arrivals</a>
        <a href="#/best-sellers" data-nav="/best-sellers">Best Sellers</a>
        <a href="#/offers" data-nav="/offers">Offers</a>
        <a href="#/about" data-nav="/about" class="nav-wide">About</a>
      </nav>
      <div class="site-header__actions">
        <button class="hbtn hbtn--search" type="button" data-open-search aria-label="Search products" aria-keyshortcuts="/">${icon("search")}<span>Search</span><kbd aria-hidden="true">/</kbd></button>
        <a class="hbtn hbtn--account" href="#/account" aria-label="My account">${icon("user")}</a>
        <button class="hbtn hbtn--cart" type="button" data-open-cart aria-label="Cart">${icon("bag")}<span class="hbtn__count" data-cart-count data-count="0">0</span></button>
        <button class="hbtn hbtn--menu" type="button" data-open-menu aria-label="Open menu">${icon("menu")}</button>
      </div>
    </div>
    <span class="site-header__progress" data-progress aria-hidden="true"></span>`;
    tabbarEl.innerHTML = TABS.map(
      ([href, ic, label]) =>
        `<a href="#${href}" data-tab="${href}">${icon(ic)}<span>${label}</span>${href === "/cart" ? '<span class="tabbar__count" data-cart-count data-count="0" aria-hidden="true">0</span>' : ""}</a>`
    ).join("");
    if (!tabbarEl.isConnected) document.body.append(tabbarEl);
    const btn = $("[data-cats]", headerEl);
    const menu = $("#megamenu", headerEl);
    let hoverTimer = 0;
    const open = (show) => {
      if (show === !menu.hidden) return;
      btn.setAttribute("aria-expanded", String(show));
      if (show) {
        menu.innerHTML = megaMenu();
        menu.hidden = false;
        if (!reduceMotion) menu.animate([{ opacity: 0, transform: "scale(0.94) translateY(-6px)", filter: "blur(6px)" }, { opacity: 1, transform: "none", filter: "blur(0)" }], EASE.settle);
      } else {
        menu.hidden = true;
      }
    };
    btn.addEventListener("click", () => open(menu.hidden));
    const wrap = btn.parentElement;
    if (matchMedia("(hover: hover)").matches) {
      wrap.addEventListener("pointerenter", () => {
        clearTimeout(hoverTimer);
        hoverTimer = setTimeout(() => open(true), 120);
      });
      wrap.addEventListener("pointerleave", () => {
        clearTimeout(hoverTimer);
        hoverTimer = setTimeout(() => open(false), 220);
      });
    }
    document.addEventListener("click", (e) => {
      if (!wrap.contains(e.target)) open(false);
      else if (e.target.closest("#megamenu a")) open(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !menu.hidden) {
        open(false);
        btn.focus();
      }
    });
    window.addEventListener("hashchange", () => open(false));
  }

  function megaMenu() {
    const tops = S.db.categories.filter((c) => !c.parentId && S.catVisible(c)).sort((a, b) => a.order - b.order);
    const items = tops
      .map((c) => {
        const subs = S.db.categories.filter((s) => s.parentId === c.id && S.catVisible(s));
        const count = S.listing({ categoryId: c.id }).rows.length;
        return `<div class="megamenu__item">
          <a href="#/c/${c.slug}"><img src="${imgUrl(c.image, 120)}" alt="" loading="lazy"></a>
          <div><a href="#/c/${c.slug}"><strong>${esc(c.name)}</strong><small>${count} products</small></a>
          ${subs.length ? `<div class="megamenu__subs">${subs.map((s) => `<a href="#/c/${s.slug}">${esc(s.name)}</a>`).join("")}</div>` : ""}</div>
        </div>`;
      })
      .join("");
    return `<div class="megamenu__grid">${items}</div>
      <div class="megamenu__foot"><span class="field__hint">Every product is reviewed before it is listed.</span><a class="link" href="#/shop">Shop all products</a></div>`;
  }

  function updateHeader() {
    const { path } = parseHash();
    $$("[data-nav]", headerEl).forEach((a) => {
      const target = a.dataset.nav;
      a.classList.toggle("is-active", target === "/" ? path === "/" : path.startsWith(target));
      a.toggleAttribute("aria-current", a.classList.contains("is-active"));
    });
    $("[data-cats]", headerEl)?.classList.toggle("is-active", path.startsWith("/c/"));
    TABS.forEach(([href, , label, match]) => {
      const tab = $(`[data-tab="${href}"]`, tabbarEl);
      if (match(path)) tab?.setAttribute("aria-current", "page");
      else tab?.removeAttribute("aria-current");
      if (href === "/cart") tab?.setAttribute("aria-label", `${label}, ${S.cart.count()} item${S.cart.count() === 1 ? "" : "s"}`);
    });
    const count = S.cart.count();
    $$("[data-cart-count]").forEach((badge) => {
      // The badge bumps on the frame the cart changes: cause and feedback together.
      if (badge.textContent !== String(count) && !reduceMotion && count) badge.animate([{ transform: "scale(1.45)" }, { transform: "none" }], EASE.settle);
      badge.textContent = count;
      badge.dataset.count = count;
    });
    $("[data-open-cart]", headerEl)?.setAttribute("aria-label", `Cart, ${count} item${count === 1 ? "" : "s"}`);
    const me = S.currentCustomer();
    const acct = $(".hbtn--account", headerEl);
    if (acct) acct.setAttribute("aria-label", me ? `My account (${me.name})` : "Sign in or create an account");
  }

  function renderFooter() {
    const s = S.db.settings.business;
    const cats = S.db.categories.filter((c) => !c.parentId && S.catVisible(c)).sort((a, b) => a.order - b.order);
    footerEl.innerHTML = `<div class="container">
      <div class="footer-top">
        <p class="footer-statement">Fewer, better things, <em>chosen by hand.</em></p>
        <a class="btn btn--light btn--lg" href="#/shop" data-magnetic>Shop the range ${arrow()}</a>
      </div>
      <div class="footer-grid">
        <div class="footer-brand">
          <a class="brand" href="#/">${logoMark()}<span class="brand__name">NIRAH</span></a>
          <p>Curated for every lifestyle. A small range of everyday products, each reviewed for quality and sold only from our own stock.</p>
          <div class="socials">
            <a href="#/contact" aria-label="Instagram (link to be added)">${icon("instagram")}</a>
            <a href="#/contact" aria-label="Facebook (link to be added)">${icon("facebook")}</a>
            <a href="#/contact" aria-label="Pinterest (link to be added)">${icon("pinterest")}</a>
            <a href="#/contact" aria-label="YouTube (link to be added)">${icon("youtube")}</a>
          </div>
        </div>
        <div><h3>Shop</h3><ul>
          <li><a href="#/shop">Shop all</a></li>
          ${cats.map((c) => `<li><a href="#/c/${c.slug}">${esc(c.name)}</a></li>`).join("")}
        </ul></div>
        <div><h3>Help</h3><ul>
          <li><a href="#/policy/shipping">Shipping &amp; delivery</a></li>
          <li><a href="#/policy/returns">Returns &amp; refunds</a></li>
          <li><a href="#/faq">FAQs</a></li>
          <li><a href="#/track">Track an order</a></li>
          <li><a href="#/contact">Feedback &amp; contact</a></li>
        </ul></div>
        <div><h3>NIRAH</h3><ul>
          <li><a href="#/about">About NIRAH</a></li>
          <li><a href="#/offers">Offers</a></li>
          <li><a href="#/policy/privacy">Privacy policy</a></li>
          <li><a href="#/policy/terms">Terms of use</a></li>
          <li><a href="admin.html" target="_blank" rel="noopener">Admin portal (demo)</a></li>
        </ul></div>
      </div>
      <div class="footer-legal">
        <span>© ${new Date().getFullYear()} ${esc(s.name)} · ${esc(s.address)} · GSTIN: ${esc(s.gstin)}</span>
        <span>Prototype: data is stored in this browser. <button type="button" data-reset-demo>Reset demo data</button></span>
      </div>
    </div>
    <p class="footer-mark" aria-hidden="true">NIRAH</p>`;
    if (M.enabled) M.footer(footerEl);
  }

  // ---------- Routing ----------
  function parseHash() {
    const raw = location.hash.slice(1) || "/";
    const [path, query] = raw.split("?");
    return { path: path || "/", query: Object.fromEntries(new URLSearchParams(query || "")) };
  }

  const routes = [
    [/^\/$/, viewHome],
    [/^\/shop$/, viewShop],
    [/^\/c\/([\w-]+)$/, viewCategory],
    [/^\/p\/([\w-]+)$/, viewProduct],
    [/^\/search$/, viewSearch],
    [/^\/new$/, viewNew],
    [/^\/best-sellers$/, viewBest],
    [/^\/offers$/, viewOffers],
    [/^\/cart$/, viewCart],
    [/^\/checkout$/, viewCheckout],
    [/^\/pay\/([\w-]+)$/, viewGateway],
    [/^\/order\/([\w-]+)$/, viewOrder],
    [/^\/account$/, viewAccount],
    [/^\/track$/, viewTrack],
    [/^\/about$/, viewAbout],
    [/^\/faq$/, viewFaq],
    [/^\/contact$/, viewContact],
    [/^\/policy\/(shipping|returns|privacy|terms)$/, viewPolicy],
  ];

  function render({ keepScroll = false, fromData = false } = {}) {
    const { path, query } = parseHash();
    let fn = view404;
    let args = [];
    for (const [re, f] of routes) {
      const m = path.match(re);
      if (m) {
        fn = f;
        args = m.slice(1);
        break;
      }
    }
    // Keep focus on the control the customer was using across a re-render.
    const active = document.activeElement;
    const focusKey = active && main.contains(active) ? active.name || active.dataset.focusKey || active.id : null;
    const focusVal = active?.value;
    const y = window.scrollY;

    cleanup.forEach((f) => f());
    cleanup = [];
    view = fn(args, query) || view404();
    const quiet = keepScroll || fromData;
    const swap = (ready) => {
      // Revert the outgoing page's motion only now: with a view transition the
      // old page has been captured by this point, so pins unwinding can't show.
      motionRevert?.();
      motionRevert = null;
      main.innerHTML = view.html;
      main.classList.toggle("is-home", !!view.home);
      document.body.classList.toggle("is-gateway", !!view.gateway);
      document.title = view.title ? `${view.title}` : "NIRAH";
      $('meta[name="description"]').setAttribute("content", view.description || "NIRAH is a curated online store for everyday living.");
      $("#schema").textContent = JSON.stringify(view.schema || {});
      if (previewing()) main.insertAdjacentHTML("afterbegin", `<div class="container" style="padding-top:12px"><p class="notice notice--warn">${icon("eye")} Previewing draft website content. Customers still see the published version.</p></div>`);
      view.mount?.(main);
      if (keepScroll) window.scrollTo(0, y);
      else if (!firstRender) {
        window.scrollTo(0, 0);
        main.focus({ preventScroll: true });
      }
      // Motion measures the page where it now sits, so it runs after scrolling.
      if (M.enabled) motionRevert = M.page(main, { home: !!view.home, quiet, first: firstRender, ready });
      else observeReveal(main);
      if (focusKey) {
        const el = $$(`[name="${focusKey}"], [data-focus-key="${focusKey}"], #${CSS.escape(focusKey)}`, main).find((x) => !("value" in x) || x.type === "checkbox" || x.value === focusVal) || null;
        el?.focus({ preventScroll: true });
      }
      updateHeader();
      firstRender = false;
    };
    if (!quiet && !firstRender && document.startViewTransition && !reduceMotion) {
      // Entrances wait for the cross-fade to finish; until then the live page
      // is hidden behind the transition's snapshot.
      let done;
      const ready = new Promise((r) => (done = r));
      const vt = document.startViewTransition(() => swap(ready));
      vt.ready.catch(() => {}); // a newer navigation skipped this one; nothing to do
      vt.finished.finally(done);
    } else swap(firstRender ? introDone : Promise.resolve());
  }

  // Re-render live pages when data changes elsewhere (another tab, the gateway).
  let pending = 0;
  S.subscribe((why) => {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => {
      updateHeader();
      sheetRefreshers.forEach((f) => f());
      if (!view) return;
      if (view.onData) return view.onData(why);
      const editing = document.activeElement && main.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !document.activeElement.closest("[data-stepper]");
      if (view.live && !editing) render({ keepScroll: true, fromData: true });
    });
  });

  // ---------- Reveal on scroll ----------
  let io = null;
  function observeReveal(root) {
    $$("[data-reveal-group]", root).forEach((g) => [...g.children].forEach((c, i) => c.style.setProperty("--i", String(Math.min(i, 8)))));
    const targets = $$("[data-reveal], [data-reveal-group]", root);
    if (!("IntersectionObserver" in window) || firstRender === "never") return targets.forEach((t) => t.classList.add("is-visible"));
    io?.disconnect();
    io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            io.unobserve(e.target);
          }
        }),
      { threshold: 0.08, rootMargin: "0px 0px -30px 0px" }
    );
    targets.forEach((t) => io.observe(t));
  }

  // ---------- Home ----------
  // Home sections are numbered in the order they appear, like chapters.
  const pad = (n) => String(n).padStart(2, "0");
  let chapterNo = 0;
  const nextNo = () => pad(++chapterNo);
  const topCats = () => S.db.categories.filter((c) => !c.parentId && S.catVisible(c)).sort((a, b) => a.order - b.order);

  // Sales running now, shown in the edge-to-edge hero carousel. Art lives in
  // assets/promos (trimmed to each banner's own card). The frame takes the
  // brand banners' shape (1146 × 400) until it reaches its height cap on very
  // wide screens; any banner that doesn't fill it sits centred, whole, on a
  // soft blurred fill of itself.
  const PROMO_FRAME = 1146 / 400;
  const PROMOS = [
    { src: "assets/promos/sale-50-90-off.webp", w: 1402, h: 374, alt: "Diwali Edit, live now: last call for festive favourites and dazzling deals. Ends 8 November." },
    { src: "assets/promos/nike-min50-extra20.webp", w: 1146, h: 400, alt: "Nike: minimum 50% off, plus an extra 20%." },
    { src: "assets/promos/kvsfab-fashor-min70.webp", w: 1146, h: 400, alt: "Kvsfab, Fashor and more: minimum 70% off." },
    { src: "assets/promos/adidas-puma-min40.webp", w: 1146, h: 400, alt: "Adidas, Puma and more: minimum 40% off." },
  ];

  function promoHtml() {
    const n = PROMOS.length;
    return `<div class="promo" data-promo role="region" aria-roledescription="carousel" aria-label="Sales running now" style="--frame:${PROMO_FRAME.toFixed(4)}">
      <div class="promo__viewport">
        ${PROMOS.map((p, i) => {
          const fit = Math.abs(p.w / p.h - PROMO_FRAME) > 0.05;
          return `<a class="promo__slide${i ? "" : " is-active"}" href="#/offers" draggable="false" role="group" aria-roledescription="slide" aria-label="${i + 1} of ${n}" data-promo-slide${i ? ' aria-hidden="true" tabindex="-1"' : ""} style="--ar:${(p.w / p.h).toFixed(4)}">
            <img class="promo__fill" src="${p.src}" alt="" aria-hidden="true" draggable="false">
            <img class="promo__img${fit ? " promo__img--fit" : ""}" src="${p.src}" alt="${esc(p.alt)}" width="${p.w}" height="${p.h}" decoding="async" draggable="false"${i ? "" : ' fetchpriority="high"'}></a>`;
        }).join("")}
        <button class="promo__arrow promo__arrow--prev" type="button" data-promo-prev aria-label="Previous offer">${icon("left")}</button>
        <button class="promo__arrow promo__arrow--next" type="button" data-promo-next aria-label="Next offer">${icon("right")}</button>
      </div>
      <div class="promo__controls">
        <div class="promo__dots">${PROMOS.map((p, i) => `<button class="promo__dot" type="button" data-promo-go="${i}" aria-label="Show offer ${i + 1} of ${n}"${i ? "" : ' aria-current="true"'}><span class="promo__dot-fill"></span></button>`).join("")}</div>
        <button class="promo__toggle" type="button" data-promo-toggle aria-label="Pause the offers">${icon("pause")}</button>
      </div>
    </div>`;
  }

  function heroHtml(c) {
    // The last word of the headline is set in italic clay: the one accent.
    const lines = c.hero.title.split("\n").map(esc);
    lines[lines.length - 1] = lines[lines.length - 1].replace(/(\S+)$/, "<em>$1</em>");
    return `<section class="hero" aria-labelledby="hero-title" data-hero>
      ${promoHtml()}
      <div class="hero__inner container">
        <div class="hero__copy">
          <div class="hero__lead">
            <p class="overline hero__kicker"><span data-count-to>${S.publicProducts().length}</span> products · <span data-count-to>${topCats().length}</span> categories · all from our own stock</p>
            <h1 class="hero__title" id="hero-title">${lines.join("<br>")}</h1>
          </div>
          <div class="hero__side">
            <p class="hero__text">${esc(c.hero.text)}</p>
            <div class="hero__cta">
              <a class="btn btn--primary btn--lg" href="#/shop" data-magnetic>${esc(c.hero.primary)} ${arrow()}</a>
              <button class="btn-text" type="button" data-scroll-to="home-categories">${esc(c.hero.secondary)} ${icon("down")}</button>
            </div>
          </div>
        </div>
      </div>
      <ul class="hero__promises container">${c.promises
        .map(([ic, text], i) => `<li><span class="overline__no">${pad(i + 1)}</span>${icon(ic)}<p>${esc(text).replace("\n", "<br>")}</p></li>`)
        .join("")}</ul>
    </section>`;
  }

  // Looping strip of everything discounted right now, plus public coupon codes.
  // The set is rendered twice so the loop is seamless; the copy is hidden from
  // assistive tech and the keyboard.
  function dealsHtml() {
    const items = S.publicProducts()
      .map((p) => ({ p, pr: S.pricing(p) }))
      .filter(({ p, pr }) => pr.promo && S.stockOf(p.sku).available > 0)
      .sort((a, b) => b.pr.percent - a.pr.percent);
    const coupons = S.db.promotions.filter((p) => p.type === "coupon" && p.public && S.promoState(p) === "active");
    if (!items.length && !coupons.length) return "";
    const value = (p) => (p.mode === "percent" ? `${p.value}% off` : `${money(p.value)} off`);
    const set = (copy) => `<div class="deals__set" ${copy ? 'aria-hidden="true"' : ""}>${[
      ...items.map(({ p, pr }) => `<a class="deal" href="#/p/${p.slug}" ${copy ? 'tabindex="-1"' : ""}>
        <img src="${imgUrl(p.images[0], 128)}" alt="" width="64" height="64" decoding="async">
        <span class="deal__body"><span class="deal__name">${esc(p.title)}</span>
          <span class="deal__meta">${esc(pr.promo.name)} · ${endsIn(pr.promo.endsAt)}</span>
          <span class="deal__price">${money(pr.price)}<s>${money(pr.regular)}</s></span></span>
        <span class="deal__off">−${pr.percent}%</span></a>`),
      ...coupons.map((p) => `<a class="deal deal--code" href="#/offers" ${copy ? 'tabindex="-1"' : ""}>
        <span class="deal__body"><span class="deal__name">Code <b>${esc(p.code)}</b></span>
          <span class="deal__meta">${value(p)}${p.minSpend ? ` on ${money(p.minSpend)}+` : ""} · items not on offer</span></span></a>`),
    ].join("")}</div>`;
    const count = items.length + coupons.length;
    const seconds = Math.max(30, count * 6);
    return `<section class="deals" aria-labelledby="deals-title" data-marquee="${seconds}">
      <div class="container deals__head"><p class="overline deals__title" id="deals-title">Offers running now <span>· ${count} deal${count === 1 ? "" : "s"}</span></p><a class="text-link" href="#/offers">See all offers ${arrow()}</a></div>
      <div class="deals__viewport"><div class="deals__track" style="--deals-duration:${seconds}s">${set(false)}${set(true)}</div></div>
    </section>`;
  }

  const homeSections = {
    categories() {
      const cats = topCats();
      return `<section class="chapter chapter--cats" id="home-categories" aria-labelledby="h-cats" data-carousel data-cats-pin>
        <div class="container">${sectionHead({
          no: nextNo(),
          eyebrow: "Categories",
          title: "Shop by Category",
          id: "h-cats",
          lede: "A deliberately small range in each category, chosen for everyday use.",
          aside: `<div class="carousel-nav">
            <button class="round-btn" type="button" data-carousel-prev aria-label="Previous categories">${icon("left")}</button>
            <button class="round-btn" type="button" data-carousel-next aria-label="Next categories">${icon("right")}</button></div>`,
        })}</div>
        <ul class="carousel cats-track" data-carousel-track data-reveal-group>
          ${cats
            .map((c, i) => {
              const count = S.listing({ categoryId: c.id }).rows.filter((r) => r.stock.available > 0).length;
              return `<li class="category-card"><a href="#/c/${c.slug}" draggable="false">
                <span class="category-card__media"><img src="${imgUrl(c.image, 720, 900)}" alt="" width="720" height="900" loading="lazy" decoding="async"></span>
                <span class="category-card__count">${count} in stock</span>
                <span class="category-card__body"><span class="category-card__no">${pad(i + 1)}</span><span class="category-card__name">${esc(c.name)}</span>
                <span class="category-card__note">${esc(c.description)}</span></span></a></li>`;
            })
            .join("")}
        </ul>
        <div class="container"><div class="carousel-progress" aria-hidden="true"><span class="carousel-progress__bar" data-carousel-bar></span></div></div>
      </section>`;
    },
    popular() {
      const top = S.bestSellers({ limit: 8 });
      if (!top.length) return "";
      const cats = [...new Set(S.bestSellers({ limit: 40 }).map((b) => S.categoryChain(b.product.categoryId).slice(-1)[0]))].map((id) => S.catById(id)).filter(Boolean);
      return `<section class="chapter container" aria-labelledby="h-popular">
        ${sectionHead({
          no: nextNo(),
          eyebrow: "Popular now",
          title: "Fast-selling this month",
          id: "h-popular",
          lede: `Ranked by units sold in paid orders over the last ${S.db.settings.bestSellers.windowDays} days. Only in-stock items are shown.`,
          aside: `<a class="text-link" href="#/best-sellers">All best sellers ${arrow()}</a>`,
        })}
        <div class="filters-row" role="group" aria-label="Filter popular products" data-reveal>
          <button class="chip is-active" type="button" data-popular="" aria-pressed="true">All</button>
          ${cats.map((c) => `<button class="chip" type="button" data-popular="${c.id}" aria-pressed="false">${esc(c.name)}</button>`).join("")}
        </div>
        <div data-popular-grid>${grid(top.map((b) => b.product), "", true)}</div>
      </section>`;
    },
    offers() {
      const campaign = S.db.promotions.filter((p) => p.type === "campaign" && S.promoState(p) === "active").sort((a, b) => a.endsAt - b.endsAt)[0];
      if (!campaign) return "";
      const items = S.publicProducts()
        .filter((p) => S.pricing(p).promo?.id === campaign.id && S.stockOf(p.sku).available > 0)
        .slice(0, 4);
      const value = campaign.mode === "percent" ? `${campaign.value}% off` : `${money(campaign.value)} off`;
      return `<section class="chapter container" aria-labelledby="h-offers">
        <div class="offer-banner">
          <div class="offer-banner__media" data-clip><img src="${imgUrl(campaign.image, 1200, 1000)}" alt="" loading="lazy" decoding="async" data-parallax></div>
          <div class="offer-banner__body">
            <p class="overline" data-reveal><span class="overline__no">${nextNo()}</span>Seasonal offer · ${endsIn(campaign.endsAt)}</p>
            <h2 class="offer-banner__title" id="h-offers">${esc(campaign.name)}</h2>
            <p class="offer-banner__value" data-reveal>${value}</p>
            <p class="offer-banner__text" data-reveal>${esc(campaign.banner)} ${value} eligible items while stock lasts.</p>
            <a class="btn btn--light btn--lg" href="#/offers" data-magnetic data-reveal>See the offer ${arrow()}</a>
          </div>
        </div>
        ${items.length ? grid(items) : ""}
      </section>`;
    },
    new() {
      const items = S.newArrivals(4);
      return `<section class="chapter container" aria-labelledby="h-new">
        ${sectionHead({ no: nextNo(), eyebrow: "New arrivals", title: "Just in", id: "h-new", lede: "Recently approved additions, shown separately so they are not buried by established favourites.", aside: `<a class="text-link" href="#/new">View all ${arrow()}</a>` })}
        ${grid(items)}
      </section>`;
    },
    featured(c) {
      const items = (c.pinned || []).map((id) => S.productById(id)).filter((p) => p && S.isPublic(p));
      if (!items.length) return "";
      return `<section class="chapter container" aria-labelledby="h-featured">
        ${sectionHead({ no: nextNo(), eyebrow: "Selected for you", title: "Pieces we keep coming back to", id: "h-featured", lede: "Chosen by our team for how well they hold up in daily use." })}
        ${grid(items, "products--feature")}
      </section>`;
    },
    promise(c) {
      return `<section class="chapter container" aria-labelledby="h-promise">
        ${sectionHead({ no: nextNo(), eyebrow: "Quality promise", title: "How a product earns its place", id: "h-promise", aside: `<a class="text-link" href="#/about">Our standards ${arrow()}</a>` })}
        <div class="manifesto">
          <p class="manifesto__text" data-manifesto>${esc(c.about.intro)}</p>
          <ol class="standards-list">
            ${c.about.standards
              .map(([h, p], i) => `<li class="standard" data-reveal><span class="standard__rule" data-rule aria-hidden="true"></span><span class="overline__no">${pad(i + 1)}</span><h3>${esc(h)}</h3><p>${esc(p)}</p></li>`)
              .join("")}
          </ol>
        </div>
      </section>`;
    },
    reviews() {
      const picks = S.db.reviews
        .filter((r) => r.state === "approved" && r.rating >= 4 && r.body.length > 40)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 3);
      if (!picks.length) return "";
      return `<section class="chapter container" aria-labelledby="h-reviews">
        ${sectionHead({ no: nextNo(), eyebrow: "Customer reviews", title: "From verified buyers", id: "h-reviews", lede: "Only customers who received a product can review it." })}
        <div class="quotes" data-reveal-group>
          ${picks
            .map((r) => {
              const p = S.productById(r.productId);
              return `<figure class="quote"><blockquote>“${esc(r.body)}”</blockquote>
                <figcaption>${stars(r.rating)}<strong>${esc(r.name)}</strong><span class="verified">${icon("check")} Verified purchase</span>
                <a class="link" href="#/p/${p.slug}">${esc(p.title)}</a></figcaption></figure>`;
            })
            .join("")}
        </div>
      </section>`;
    },
  };

  function viewHome() {
    const c = site();
    chapterNo = 0;
    const sections = c.sections
      .filter((s) => s.visible && homeSections[s.key])
      .map((s) => homeSections[s.key](c))
      .join("");
    return {
      title: "NIRAH — Curated for Every Lifestyle",
      home: true,
      html: `${heroHtml(c)}${dealsHtml()}<div class="shop">${sections}</div>`,
      mount(el) {
        mountCarousels(el);
        $$("[data-popular]", el).forEach((chip) =>
          chip.addEventListener("click", () => {
            $$("[data-popular]", el).forEach((c2) => {
              c2.classList.toggle("is-active", c2 === chip);
              c2.setAttribute("aria-pressed", String(c2 === chip));
            });
            const items = S.bestSellers({ limit: 8, categoryId: chip.dataset.popular || undefined }).map((b) => b.product);
            const host = $("[data-popular-grid]", el);
            const paint = () => {
              host.innerHTML = items.length ? grid(items, "", true) : emptyState("box", "Nothing popular here yet", "Check back soon.");
              $(".products", host)?.classList.add("is-visible");
            };
            // Products that stay in the ranking glide to their new place.
            const flipped = M.enabled ? M.swap(host, paint) : (paint(), false);
            if (!flipped && !reduceMotion) $$(".product", host).forEach((card, i) => card.animate([{ opacity: 0, transform: "scale(0.95)" }, { opacity: 1, transform: "none" }], { ...EASE.settle, delay: i * 40, fill: "backwards" }));
          })
        );
      },
    };
  }

  // Category carousel: arrow presses re-target a spring; a mouse flick projects
  // to the card it was heading for; edges rubber-band; touch scrolls natively.
  function mountCarousels(root) {
    const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
    $$("[data-carousel]", root).forEach((carousel) => {
      const track = $("[data-carousel-track]", carousel);
      const prev = $("[data-carousel-prev]", carousel);
      const next = $("[data-carousel-next]", carousel);
      const bar = $("[data-carousel-bar]", carousel);
      if (!track) return;
      const maxScroll = () => track.scrollWidth - track.clientWidth;
      let overscroll = 0;
      const read = () => track.scrollLeft + overscroll;
      const apply = (pos) => {
        const inside = clamp(pos, 0, maxScroll());
        overscroll = pos - inside;
        track.scrollLeft = inside;
        track.style.transform = overscroll ? `translate3d(${-overscroll}px,0,0)` : "";
      };
      const spring = createSpring({ read, apply, onRest: () => track.classList.remove("is-gliding") });
      const glide = (to, opts) => {
        track.classList.add("is-gliding");
        spring.to(to, opts);
      };
      const snaps = () => {
        const start = track.getBoundingClientRect().left + parseFloat(getComputedStyle(track).paddingLeft);
        const max = maxScroll();
        return [...new Set([...track.children].map((c) => clamp(Math.round(c.getBoundingClientRect().left - start + track.scrollLeft), 0, max)))].sort((a, b) => a - b);
      };
      // While the motion layer pins the row (wide screens), scroll drives it
      // and these controls stand down.
      const pinned = () => carousel.classList.contains("is-pinned");
      const update = () => {
        if (pinned()) return;
        const max = maxScroll();
        if (prev) prev.disabled = track.scrollLeft <= 1;
        if (next) next.disabled = track.scrollLeft >= max - 1;
        if (bar) {
          bar.style.width = `${(track.clientWidth / track.scrollWidth) * 100}%`;
          bar.style.transform = `translateX(${(track.scrollLeft / track.clientWidth) * 100}%)`;
        }
      };
      track.addEventListener("scroll", update, { passive: true });
      const ro = new ResizeObserver(update);
      ro.observe(track);
      cleanup.push(() => {
        ro.disconnect();
        spring.stop();
      });
      const go = (dir) => {
        if (pinned()) return;
        const pts = snaps();
        const from = spring.active ? spring.target : read();
        const to = dir > 0 ? pts.find((p) => p > from + 1) : pts.reverse().find((p) => p < from - 1);
        if (to !== undefined) glide(to);
      };
      prev?.addEventListener("click", () => go(-1));
      next?.addEventListener("click", () => go(1));
      const yieldToNative = () => {
        if (!spring.active) return;
        spring.stop();
        apply(clamp(read(), 0, maxScroll()));
        track.classList.remove("is-gliding");
      };
      track.addEventListener("wheel", yieldToNative, { passive: true });
      track.addEventListener("touchstart", yieldToNative, { passive: true });

      let drag = null;
      let suppress = false;
      track.addEventListener("pointerdown", (e) => {
        if (e.pointerType !== "mouse" || e.button !== 0 || pinned()) return;
        spring.stop();
        suppress = false;
        drag = { id: e.pointerId, x: e.clientX, origin: 0, moved: false, samples: [{ x: e.clientX, t: e.timeStamp }] };
      });
      track.addEventListener("pointermove", (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        if (!drag.moved) {
          if (Math.abs(e.clientX - drag.x) < 10) return;
          drag.moved = true;
          drag.x = e.clientX;
          drag.origin = read();
          track.setPointerCapture(e.pointerId);
          track.classList.remove("is-gliding");
          track.classList.add("is-dragging");
        }
        const raw = drag.origin - (e.clientX - drag.x);
        const inside = clamp(raw, 0, maxScroll());
        apply(inside + rubberband(raw - inside, track.clientWidth));
        drag.samples.push({ x: e.clientX, t: e.timeStamp });
        while (drag.samples.length > 2 && e.timeStamp - drag.samples[0].t > 100) drag.samples.shift();
      });
      const release = (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        const { moved, samples } = drag;
        drag = null;
        if (!moved) return;
        suppress = true;
        track.classList.remove("is-dragging");
        const a = samples[0];
        const b = samples[samples.length - 1];
        const span = b.t - a.t;
        const v = e.timeStamp - b.t > 80 || span <= 0 ? 0 : (-(b.x - a.x) / span) * 1000;
        const pts = snaps();
        const resting = read() + project(v);
        const target = pts.reduce((best, p) => (Math.abs(p - resting) < Math.abs(best - resting) ? p : best));
        glide(target, { velocity: v, params: Math.abs(v) > 400 ? SPRING.flick : SPRING.settle });
      };
      track.addEventListener("pointerup", release);
      track.addEventListener("pointercancel", release);
      track.addEventListener("click", (e) => {
        if (suppress) {
          e.preventDefault();
          suppress = false;
        }
      }, true);
      track.addEventListener("dragstart", (e) => e.preventDefault());
    });
  }

  // ---------- Listing pages ----------
  function filtersForm(q, facets, { withCategories }) {
    const cats = S.db.categories.filter((c) => !c.parentId && S.catVisible(c)).sort((a, b) => a.order - b.order);
    const chosen = list(q.cat);
    const box = (name, value, label, checked, extra = "") =>
      `<label class="check ${extra}"><input type="checkbox" name="${name}" value="${esc(value)}" ${checked ? "checked" : ""}> <span>${esc(label)}</span></label>`;
    return `<form class="filters" data-filters>
      ${withCategories ? `<fieldset><legend>Category</legend>${cats
        .map((c) => {
          const subs = S.db.categories.filter((s) => s.parentId === c.id && S.catVisible(s));
          return box("cat", c.slug, c.name, chosen.includes(c.slug)) + subs.map((s) => box("cat", s.slug, s.name, chosen.includes(s.slug), "sub")).join("");
        })
        .join("")}</fieldset>` : ""}
      <fieldset><legend>Price</legend>
        <div class="price-range"><input name="min" type="number" inputmode="numeric" min="0" placeholder="Min ₹" value="${esc(q.min || "")}" aria-label="Minimum price"><span>–</span><input name="max" type="number" inputmode="numeric" min="0" placeholder="Max ₹" value="${esc(q.max || "")}" aria-label="Maximum price"></div>
        <div class="price-presets">
          <button class="chip" type="button" data-price="0-999">Under ₹1,000</button>
          <button class="chip" type="button" data-price="1000-2500">₹1,000–2,500</button>
          <button class="chip" type="button" data-price="2500-">Above ₹2,500</button>
        </div>
      </fieldset>
      <fieldset><legend>Availability</legend>
        ${box("stock", "1", "In stock only", q.stock === "1")}
        ${box("offer", "1", "On offer", q.offer === "1")}
      </fieldset>
      ${facets.materials.length > 1 ? `<fieldset><legend>Material</legend>${facets.materials.map((m) => box("mat", m, m, list(q.mat).includes(m))).join("")}</fieldset>` : ""}
      ${facets.colors.length > 1 ? `<fieldset><legend>Colour</legend>${facets.colors.map((c) => box("col", c, c, list(q.col).includes(c))).join("")}</fieldset>` : ""}
      <button class="btn btn--ghost btn--sm" type="reset">Clear all filters</button>
    </form>`;
  }

  function readFilters(form, q) {
    const fd = new FormData(form);
    return { ...q, cat: fd.getAll("cat"), min: fd.get("min"), max: fd.get("max"), stock: fd.get("stock") || "", offer: fd.get("offer") || "", mat: fd.getAll("mat"), col: fd.getAll("col") };
  }

  function listingView({ title, description, base, q, categoryId = null, head, withCategories = false, defaultSort = "featured", search = null, emptyHtml }) {
    const chosen = list(q.cat).map((slug) => S.db.categories.find((c) => c.slug === slug)).filter(Boolean);
    const sort = q.sort || defaultSort;
    const opts = { categoryId, q: search, min: q.min, max: q.max, inStock: q.stock === "1", onOffer: q.offer === "1", material: list(q.mat), color: list(q.col), sort };
    let { rows, facets } = S.listing(opts);
    if (chosen.length) {
      const ids = chosen.flatMap((c) => S.descendants(c.id));
      rows = rows.filter((r) => ids.includes(r.p.categoryId));
    }
    const active = [
      ...chosen.map((c) => ["cat", c.slug, c.name]),
      ...(q.min ? [["min", q.min, `From ${money(q.min)}`]] : []),
      ...(q.max ? [["max", q.max, `Up to ${money(q.max)}`]] : []),
      ...(q.stock === "1" ? [["stock", "1", "In stock"]] : []),
      ...(q.offer === "1" ? [["offer", "1", "On offer"]] : []),
      ...list(q.mat).map((m) => ["mat", m, m]),
      ...list(q.col).map((c) => ["col", c, c]),
    ];
    const sorts = [
      ...(search ? [["relevance", "Most relevant"]] : []),
      ["featured", "Featured"],
      ["best", "Best selling"],
      ["new", "Newest"],
      ["price-asc", "Price: low to high"],
      ["price-desc", "Price: high to low"],
    ];
    const inStock = rows.filter((r) => r.stock.available > 0).length;
    const html = `<div class="container">${head}
      <div class="listing">
        <aside class="listing__side" aria-label="Filters">${filtersForm(q, facets, { withCategories })}</aside>
        <section aria-label="Products">
          <div class="toolbar">
            <p class="toolbar__count" role="status">${rows.length} product${rows.length === 1 ? "" : "s"} · ${inStock} in stock</p>
            <div class="toolbar__right">
              <button class="btn btn--ghost btn--sm filter-toggle" type="button" data-open-filters>${icon("filter")} Filters${active.length ? ` (${active.length})` : ""}</button>
              <label class="sr-only" for="sort">Sort by</label>
              <select class="select" id="sort" data-sort>${sorts.map(([v, l]) => `<option value="${v}" ${v === sort ? "selected" : ""}>${l}</option>`).join("")}</select>
            </div>
          </div>
          ${active.length ? `<div class="active-filters">${active.map(([k, v, l]) => `<button class="chip" type="button" data-unfilter="${k}" data-value="${esc(v)}" aria-label="Remove filter ${esc(l)}">${esc(l)} ${icon("close")}</button>`).join("")}</div>` : ""}
          ${rows.length ? grid(rows.map((r) => r.p)) : emptyHtml || emptyState("search", "No products match these filters", "Try removing a filter or widening the price range.", '<button class="btn btn--ghost" type="button" data-clear-filters>Clear filters</button>')}
        </section>
      </div></div>`;

    const go = (next) => {
      history.replaceState(null, "", `#${base}${qs(next) ? `?${qs(next)}` : ""}`);
      render({ keepScroll: true });
    };
    return {
      title,
      description,
      html,
      live: true,
      mount(el) {
        const wire = (form) => {
          form.addEventListener("change", () => go(readFilters(form, q)));
          form.addEventListener("reset", (e) => {
            e.preventDefault();
            go({ sort: q.sort, q: q.q });
          });
          $$("[data-price]", form).forEach((b) =>
            b.addEventListener("click", () => {
              const [min, max] = b.dataset.price.split("-");
              go({ ...readFilters(form, q), min, max });
            })
          );
        };
        $$("[data-filters]", el).forEach(wire);
        $("[data-sort]", el)?.addEventListener("change", (e) => go({ ...q, sort: e.target.value }));
        $$("[data-unfilter]", el).forEach((b) =>
          b.addEventListener("click", () => {
            const { unfilter: k, value: v } = b.dataset;
            const next = { ...q };
            if (["cat", "mat", "col"].includes(k)) next[k] = list(q[k]).filter((x) => x !== v);
            else delete next[k];
            go(next);
          })
        );
        $("[data-clear-filters]", el)?.addEventListener("click", () => go({ sort: q.sort, q: q.q }));
        $("[data-open-filters]", el)?.addEventListener("click", (e) => {
          const sheet = openSheet({ title: "Filters", side: "bottom", origin: e.currentTarget, html: filtersForm(q, facets, { withCategories }) + `<div class="sheet__foot"><button class="btn btn--primary btn--block" type="button" data-close>Show results</button></div>` });
          const form = $("[data-filters]", sheet.body);
          form.addEventListener("change", () => {
            history.replaceState(null, "", `#${base}?${qs(readFilters(form, q))}`);
            Object.assign(q, readFilters(form, q));
          });
          form.addEventListener("reset", (ev) => {
            ev.preventDefault();
            form.querySelectorAll("input").forEach((i) => (i.type === "checkbox" ? (i.checked = false) : (i.value = "")));
            Object.assign(q, { cat: [], min: "", max: "", stock: "", offer: "", mat: [], col: [] });
            history.replaceState(null, "", `#${base}?${qs({ sort: q.sort, q: q.q })}`);
          });
          $$("[data-price]", form).forEach((b) => b.addEventListener("click", () => {
            const [min, max] = b.dataset.price.split("-");
            form.min.value = min;
            form.max.value = max || "";
            form.dispatchEvent(new Event("change"));
          }));
          const origClose = sheet.close;
          sheet.el.addEventListener("click", (ev) => ev.target.closest("[data-close]") && render({ keepScroll: true }));
          void origClose;
        });
      },
    };
  }

  function viewShop(_, q) {
    return listingView({
      title: "Shop All — NIRAH",
      description: "Browse NIRAH's full curated range. Every product is in stock in our own warehouse.",
      base: "/shop",
      q,
      withCategories: true,
      head: `<header class="page-head">${crumbs([["Home", "#/"], ["Shop All", ""]])}<h1 class="page-title">Shop All</h1><p class="page-lede">The full NIRAH range in one place. Out-of-stock items stay visible so you know what we carry, but they can't be ordered until they are back.</p></header>`,
    });
  }

  function viewCategory([slug], q) {
    const c = S.db.categories.find((x) => x.slug === slug);
    if (!c || !S.catVisible(c)) return view404("This category isn't available right now.");
    const chain = S.categoryChain(c.id).reverse().map((id) => S.catById(id));
    const subs = S.db.categories.filter((s) => s.parentId === c.id && S.catVisible(s));
    const count = S.listing({ categoryId: c.id }).rows.filter((r) => r.stock.available > 0).length;
    return listingView({
      title: `${c.seoTitle || c.name} — NIRAH`,
      description: c.seoDescription || c.description,
      base: `/c/${slug}`,
      q,
      categoryId: c.id,
      head: `<header class="page-head">
        <div class="cat-banner"><img src="${imgUrl(c.image, 1600, 600)}" alt="">
          <div>${crumbs([["Home", "#/"], ["Shop All", "#/shop"], ...chain.map((x, i) => [x.name, i < chain.length - 1 ? `#/c/${x.slug}` : ""])])}
          <h1 class="page-title">${esc(c.name)}</h1><p class="page-lede">${esc(c.description)} · ${count} item${count === 1 ? "" : "s"} available</p></div>
        </div>
        ${subs.length ? `<div class="subcats">${subs.map((s) => `<a class="chip" href="#/c/${s.slug}">${esc(s.name)}</a>`).join("")}</div>` : ""}
      </header>`,
    });
  }

  function viewSearch(_, q) {
    const term = String(q.q || "").trim();
    const cats = S.db.categories.filter((c) => !c.parentId && S.catVisible(c));
    const v = listingView({
      title: term ? `Search: ${term} — NIRAH` : "Search — NIRAH",
      base: "/search",
      q,
      search: term,
      withCategories: true,
      defaultSort: "relevance",
      head: `<header class="page-head">${crumbs([["Home", "#/"], ["Search", ""]])}
        <h1 class="page-title">${term ? `Results for “${esc(term)}”` : "Search"}</h1>
        <form class="search-box" style="margin-top:20px;max-width:620px" data-search-form role="search">${icon("search")}<input name="q" value="${esc(term)}" placeholder="Search products, SKUs, materials…" aria-label="Search"><button class="btn btn--primary btn--sm" type="submit">Search</button></form>
      </header>`,
      emptyHtml: emptyState(
        "search",
        term ? `Nothing found for “${term}”` : "Start typing to search",
        "Check the spelling, try a more general word (for example “mug” instead of “stoneware mug”), or browse a category.",
        `<div class="subcats">${cats.map((c) => `<a class="chip" href="#/c/${c.slug}">${esc(c.name)}</a>`).join("")}</div>`
      ),
    });
    // Arriving on Search with nothing typed puts the cursor in the field.
    const mount = v.mount;
    v.mount = (el) => {
      mount(el);
      if (!term)
        requestAnimationFrame(() => {
          if (document.activeElement === main || document.activeElement === document.body) $("[data-search-form] input", el)?.focus({ preventScroll: true });
        });
    };
    return v;
  }

  function viewNew() {
    const items = S.newArrivals(40);
    return {
      title: "New Arrivals — NIRAH",
      live: true,
      html: `<div class="container"><header class="page-head">${crumbs([["Home", "#/"], ["New Arrivals", ""]])}
        <h1 class="page-title">New Arrivals</h1><p class="page-lede">Recently launched products, newest first. Items marked New were approved in the last ${S.db.settings.newArrivalDays} days.</p></header>
        ${grid(items)}<div style="height:96px"></div></div>`,
    };
  }

  function viewBest(_, q) {
    const days = [7, 30, 90].includes(Number(q.days)) ? Number(q.days) : S.db.settings.bestSellers.windowDays;
    const cat = q.cat ? S.db.categories.find((c) => c.slug === q.cat) : null;
    const items = S.bestSellers({ windowDays: days, limit: 24, categoryId: cat?.id });
    const tops = S.db.categories.filter((c) => !c.parentId && S.catVisible(c));
    const link = (o) => `#/best-sellers?${qs({ days, cat: q.cat, ...o })}`;
    return {
      title: "Best Sellers — NIRAH",
      live: true,
      html: `<div class="container"><header class="page-head">${crumbs([["Home", "#/"], ["Best Sellers", ""]])}
        <h1 class="page-title">Best Sellers</h1>
        <p class="page-lede">Ranked by units sold in paid, non-cancelled orders over the last ${days} days${S.db.settings.bestSellers.deductReturns ? ", minus returns" : ""}. Items picked by our team are marked first. Only products you can buy right now are shown.</p>
        <div class="filters-row">
          ${[7, 30, 90].map((d) => `<a class="chip ${d === days ? "is-active" : ""}" href="${link({ days: d })}" aria-current="${d === days}">Last ${d} days</a>`).join("")}
        </div>
        <div class="filters-row" style="margin-top:8px">
          <a class="chip ${!cat ? "is-active" : ""}" href="${link({ cat: "" })}">All categories</a>
          ${tops.map((c) => `<a class="chip ${cat?.id === c.id ? "is-active" : ""}" href="${link({ cat: c.slug })}">${esc(c.name)}</a>`).join("")}
        </div></header>
        ${items.length ? grid(items.map((b) => b.product), "", true) : emptyState("chart", "No best sellers here yet", "There have been no paid orders in this window.")}
        <div style="height:96px"></div></div>`,
    };
  }

  function viewOffers() {
    const active = S.db.promotions.filter((p) => S.promoState(p) === "active");
    const campaigns = active.filter((p) => p.type === "campaign");
    const auto = active.filter((p) => p.type === "product" || p.type === "category");
    const coupons = active.filter((p) => p.type === "coupon" && p.public);
    const items = S.publicProducts().filter((p) => S.pricing(p).promo && S.stockOf(p.sku).available > 0);
    const scope = (p) =>
      [
        ...p.categoryIds.map((id) => catName(id)),
        ...p.skus.map((sku) => S.productBySku(sku)?.title).filter(Boolean),
      ].join(", ") || "All products";
    const value = (p) => (p.mode === "percent" ? `${p.value}% off` : `${money(p.value)} off`);
    return {
      title: "Offers — NIRAH",
      description: "Current NIRAH offers and the products they apply to.",
      live: true,
      html: `<div class="container"><header class="page-head">${crumbs([["Home", "#/"], ["Offers", ""]])}
        <h1 class="page-title">Offers</h1><p class="page-lede">Only offers that are live right now are listed. Discounts don't stack: each item gets the single best offer it qualifies for, and out-of-stock items can't be bought on offer.</p></header>
        ${campaigns.map((c) => `<div class="offer-banner" style="margin-bottom:16px"><img src="${imgUrl(c.image, 900, 700)}" alt="" loading="lazy">
          <div class="offer-banner__body"><span class="offer-banner__kicker">Seasonal campaign · ${endsIn(c.endsAt)}</span><h3>${esc(c.name)}</h3>
          <p>${esc(c.banner)}</p><p>${value(c)} on ${esc(scope(c))}.</p></div></div>`).join("")}
        ${auto.length || coupons.length ? `<div class="promise" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr))">
          ${auto.map((p) => `<div class="promise__item">${icon("percent")}<h3>${esc(p.name)}: ${value(p)}</h3><p>Applies to ${esc(scope(p))}${p.excludeSkus.length ? ` (some items excluded)` : ""}. ${endsIn(p.endsAt)}.</p></div>`).join("")}
          ${coupons.map((p) => `<div class="coupon-card"><div><code>${esc(p.code)}</code><p class="field__hint" style="margin-top:8px">${value(p)}${p.minSpend ? ` on orders of ${money(p.minSpend)}+` : ""} · items not already on offer · ${p.perCustomerLimit ? `${p.perCustomerLimit} use${p.perCustomerLimit > 1 ? "s" : ""} per customer` : ""} · ${endsIn(p.endsAt)}</p></div><button class="btn btn--ghost btn--sm" type="button" data-copy="${esc(p.code)}">${icon("copy")} Copy</button></div>`).join("")}
        </div>` : ""}
        <h2 class="section-title" style="font-size:32px;margin-top:56px">On offer now</h2>
        ${items.length ? grid(items) : emptyState("tag", "No discounted items right now", "Check back soon.")}
        <div style="height:96px"></div></div>`,
    };
  }

  // ---------- Product detail ----------
  const qtyMemory = new Map();
  function viewProduct([slug], q) {
    const p = S.productBySlug(slug);
    const adminPreview = q.preview === "1" && S.admin.can("products.view");
    if (!p || (!S.isPublic(p) && !adminPreview)) return view404("This product isn't available.");
    S.track("view", p.id);
    const pr = S.pricing(p);
    const st = S.stockOf(p.sku);
    const rs = S.ratingSummary(p.id);
    const reviews = S.approvedReviews(p.id);
    const chain = S.categoryChain(p.categoryId).reverse().map((id) => S.catById(id));
    const limit = Math.min(st.available, p.maxPerOrder);
    const qty = Math.min(qtyMemory.get(p.sku) || 1, Math.max(1, limit));
    const purchasable = S.isPublic(p) && st.available > 0;
    const pin = S.cart.get().pincode;
    const ship = pin ? S.shippingQuote(pin, pr.price) : null;
    const elig = S.reviewEligibility(p.id);
    const related = S.listing({ categoryId: S.categoryChain(p.categoryId).slice(-1)[0], inStock: true, sort: "best" }).rows.map((r) => r.p).filter((x) => x.id !== p.id).slice(0, 4);
    const specs = [
      ["SKU", p.sku],
      ...(p.brand ? [["Brand", p.brand]] : []),
      ["Category", chain.map((c) => c.name).join(" › ")],
      ...(p.material ? [["Material", p.material]] : []),
      ...(p.dimensions ? [["Size / dimensions", p.dimensions]] : []),
      ...(p.weight ? [["Weight", p.weight]] : []),
      ...(p.color && p.color !== "—" ? [["Colour", p.color]] : []),
      ...p.specs,
      ["GST", S.db.settings.taxClasses[p.taxClass]?.label || ""],
    ];
    const reviewCta =
      elig.ok
        ? `<button class="btn btn--primary" type="button" data-write-review>${icon("edit")} Write a review</button>`
        : elig.reason === "signin"
          ? `<p class="field__hint">Bought this? <a class="link" href="#/account?next=${encodeURIComponent(`/p/${p.slug}`)}">Sign in</a> to review it.</p>`
          : elig.reason === "already"
            ? `<p class="field__hint">${icon("check")} Thanks, you've reviewed this product.</p>`
            : `<p class="field__hint">Only customers who received this product can review it.</p>`;
    return {
      title: `${p.seoTitle || p.title} — NIRAH`,
      description: p.seoDescription || p.description.slice(0, 155),
      live: true,
      schema: {
        "@context": "https://schema.org",
        "@type": "Product",
        name: p.title,
        sku: p.sku,
        image: p.images.map((i) => imgUrl(i, 1200)),
        description: p.description,
        brand: p.brand ? { "@type": "Brand", name: p.brand } : undefined,
        offers: { "@type": "Offer", priceCurrency: "INR", price: pr.price, availability: st.available > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock" },
        aggregateRating: rs.count ? { "@type": "AggregateRating", ratingValue: rs.avg.toFixed(1), reviewCount: rs.count } : undefined,
      },
      html: `<div class="container">
        ${adminPreview && !S.isPublic(p) ? `<p class="notice notice--warn" style="margin-top:16px">${icon("eye")} Admin preview: this product is ${esc(p.status)} and hidden from customers.</p>` : ""}
        <header class="page-head" style="padding-bottom:16px">${crumbs([["Home", "#/"], ...chain.map((c) => [c.name, `#/c/${c.slug}`]), [p.title, ""]])}</header>
        <div class="pdp">
          <div class="gallery">
            <div class="gallery__main"><img data-gallery-main src="${imgUrl(p.images[0], 1100)}" alt="${esc(p.images[0]?.alt)}" width="1100" height="1100"></div>
            ${p.images.length > 1 ? `<div class="gallery__thumbs">${p.images.map((im, i) => `<button type="button" data-thumb="${i}" aria-current="${i === 0}" aria-label="Show image ${i + 1}"><img src="${imgUrl(im, 160)}" alt="" loading="lazy"></button>`).join("")}</div>` : ""}
          </div>
          <div class="pdp__info" data-buy>
            <div>
              <div class="pdp__eyebrow"><a class="link" href="#/c/${chain[chain.length - 1].slug}">${esc(chain[chain.length - 1].name)}</a>${p.brand ? `<span>${esc(p.brand)}</span>` : ""}${S.isNew(p) ? '<span class="badge badge--new">New</span>' : ""}</div>
              <h1 class="pdp__title">${esc(p.title)}</h1>
              <div class="pdp__sub">
                ${rs.count ? `<a href="#reviews" data-scroll-to="reviews">${stars(rs.avg)} ${rs.avg.toFixed(1)} · ${rs.count} verified review${rs.count === 1 ? "" : "s"}</a>` : "<span>No reviews yet</span>"}
                <span>SKU ${esc(p.sku)}</span>
              </div>
            </div>
            <div class="price-block">
              <p class="price-block__now">${money(pr.price)}${pr.saving ? ` <s>${money(pr.regular)}</s> <span class="badge badge--sale">−${pr.percent}%</span>` : ""}</p>
              ${pr.saving ? `<p class="save">You save ${money(pr.saving)} with ${esc(pr.promo.name)} · ${endsIn(pr.promo.endsAt)}</p>` : ""}
              <small>Inclusive of GST. Delivery charges are calculated by pincode at checkout.</small>
            </div>
            <p>${stockHtml(st)}${st.available > 0 && limit < st.available ? ` <span class="field__hint">· limit ${limit} per order</span>` : ""}${st.available > 0 && limit === st.available && st.available < p.maxPerOrder ? "" : ""}</p>
            ${purchasable
              ? `<div class="buy-row">${stepper(qty, limit, 'name="qty"')}
                <button class="btn btn--primary btn--lg" type="button" data-add="${p.sku}">${icon("bag")} Add to cart</button></div>`
              : `<div class="notice">${icon("info")} <div>${S.isPublic(p) ? "This item is out of stock. We only sell what we hold, so it can't be ordered until new stock has been received and checked." : "This product is not on sale."}</div></div>`}
            <div class="qc">
              <p class="qc__head">Quality check <small>${p.quality?.approvedBy ? `Signed off by ${esc(p.quality.approvedBy)}` : "Reviewed by the NIRAH team"}</small></p>
              <ul class="qc__steps">${[["sourcing", "Sourcing"], ["inspection", "Inspection"], ["listing", "Listing"]]
                .map(([k, label]) => `<li class="${p.quality?.[k] ? "is-done" : ""}">${icon(p.quality?.[k] ? "check" : "minus")}<span>${label}<span class="sr-only">${p.quality?.[k] ? ": done" : ": pending"}</span></span></li>`)
                .join("")}</ul>
            </div>
            <div class="delivery-check">
              <strong style="font-weight:500">${icon("truck")} Delivery</strong>
              <form data-pin-form><input class="input" name="pin" inputmode="numeric" maxlength="6" placeholder="Enter pincode" value="${esc(pin)}" aria-label="Pincode"><button class="btn btn--ghost" type="submit">Check</button></form>
              <p class="delivery-check__result" role="status">${ship ? (ship.serviceable ? `Estimated delivery to ${esc(pin)}: <strong>${esc(ship.eta)}</strong>. Shipping ${ship.fee ? money(ship.fee) : "free"} on this item alone; free over ${money(ship.freeAbove)}.` : esc(ship.message)) : `Check estimated delivery for your area. <a class="link" href="#/policy/shipping">Shipping policy</a>`}</p>
            </div>
            <ul class="trust">
              <li>${icon("refresh")}<span>${p.returnable ? `Returnable within ${S.db.settings.returnWindowDays} days of delivery if unused. <a class="link" href="#/policy/returns">Return policy</a>` : `Not returnable once opened, for hygiene or food-safety reasons, unless it arrives damaged. <a class="link" href="#/policy/returns">Return policy</a>`}</span></li>
              <li>${icon("box")}<span>Shipped from NIRAH's own stock after payment is confirmed.</span></li>
              <li>${icon("lock")}<span>Secure payment through our gateway partner. We never see your card details.</span></li>
            </ul>
            <div class="accordion">
              <details open><summary>Description ${icon("down")}</summary><div class="accordion__body"><p>${esc(p.description)}</p>${p.care ? `<p style="margin-top:12px"><strong>Care and usage:</strong> ${esc(p.care)}</p>` : ""}</div></details>
              <details><summary>Specifications ${icon("down")}</summary><div class="accordion__body"><table class="spec-table">${specs.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}</table></div></details>
              <details><summary>Delivery and returns ${icon("down")}</summary><div class="accordion__body"><p>Orders are dispatched only after payment is verified. Delivery estimates depend on your pincode. ${p.returnable ? `This item can be returned within ${S.db.settings.returnWindowDays} days of delivery.` : "This item is not returnable once opened."}</p></div></details>
            </div>
          </div>
        </div>
        <section class="reviews" id="reviews" aria-labelledby="h-reviews">
          <div>
            <h2 class="section-title" id="h-reviews" style="font-size:32px;margin:0">Reviews</h2>
            ${rs.count ? `<p class="rating-big">${rs.avg.toFixed(1)}</p>${stars(rs.avg)}<p class="field__hint">${rs.count} verified review${rs.count === 1 ? "" : "s"}</p>
              <div class="dist">${[5, 4, 3, 2, 1].map((n) => `<div class="dist__row"><span>${n}★</span><span class="dist__bar"><span style="width:${(rs.dist[n - 1] / rs.count) * 100}%"></span></span><span>${rs.dist[n - 1]}</span></div>`).join("")}</div>` : `<p class="field__hint" style="margin:12px 0 20px">No reviews yet.</p>`}
            ${reviewCta}
          </div>
          <div class="review-list">
            ${reviews.length ? reviews.slice(0, 20).map((r) => `<article class="review"><div class="review__head">${stars(r.rating)}<strong style="color:var(--text)">${esc(r.name)}</strong><span class="verified">${icon("check")} Verified purchase</span><span>${fmtDate(r.createdAt)}</span></div>
              ${r.title ? `<h4>${esc(r.title)}</h4>` : ""}<p>${esc(r.body)}</p>${r.reply ? `<div class="review__reply"><strong>NIRAH replied:</strong> ${esc(r.reply)}</div>` : ""}</article>`).join("") : '<p class="field__hint">Reviews from customers who received this product will appear here.</p>'}
          </div>
        </section>
        ${related.length ? `<section class="band" style="padding-bottom:96px">${sectionHead({ eyebrow: "More like this", title: "You might also like" })}${grid(related)}</section>` : ""}
      </div>`,
      mount(el) {
        // The gallery image is the far end of the card-to-page image morph.
        const hero = $("[data-gallery-main]", el);
        hero.style.viewTransitionName = "product-image";
        hero.dataset.vt = "";
        $$("[data-thumb]", el).forEach((b) =>
          b.addEventListener("click", () => {
            const img = $("[data-gallery-main]", el);
            const im = p.images[Number(b.dataset.thumb)];
            $$("[data-thumb]", el).forEach((x) => x.setAttribute("aria-current", String(x === b)));
            const swap = () => {
              img.src = imgUrl(im, 1100);
              img.alt = im.alt || "";
            };
            if (reduceMotion) return swap();
            img.animate([{ opacity: 1 }, { opacity: 0.2 }], { duration: 120, fill: "forwards" }).finished.then(() => {
              swap();
              img.animate([{ opacity: 0.2 }, { opacity: 1 }], { duration: 220, fill: "forwards" });
            });
          })
        );
        $(".buy-row input", el)?.addEventListener("change", (e) => qtyMemory.set(p.sku, Number(e.target.value) || 1));
        $("[data-pin-form]", el)?.addEventListener("submit", (e) => {
          e.preventDefault();
          const pinVal = e.target.pin.value.trim();
          const res = S.shippingQuote(pinVal, pr.price);
          if (res.valid) S.cart.setPincode(pinVal);
          else $(".delivery-check__result", el).textContent = res.message;
        });
        $("[data-write-review]", el)?.addEventListener("click", (e) => openReviewSheet(p, e.currentTarget));
      },
    };
  }

  function openReviewSheet(p, origin) {
    const sheet = openSheet({
      title: `Review ${p.title}`,
      side: "center",
      origin,
      html: `<form class="dialog" data-review-form style="padding-top:0">
        <p class="field__hint">Your review is checked against our review policy before it appears. We publish negative reviews too.</p>
        <fieldset class="field" style="border:0"><legend class="field__label">Your rating</legend>
          <div class="star-input">${[5, 4, 3, 2, 1].map((n) => `<input type="radio" id="rate-${n}" name="rating" value="${n}" ${n === 5 ? "" : ""}><label for="rate-${n}" aria-label="${n} star${n > 1 ? "s" : ""}">${icon("star")}</label>`).join("")}</div>
        </fieldset>
        <label class="field"><span class="field__label">Headline <span class="field__hint">(optional)</span></span><input name="title" maxlength="80"></label>
        <label class="field"><span class="field__label">Your review</span><textarea name="body" required minlength="10" maxlength="1200" placeholder="What did you like or not like? How are you using it?"></textarea></label>
        <p class="field__error" data-error role="alert"></p>
        <div class="dialog__actions"><button class="btn btn--ghost" type="button" data-close>Cancel</button><button class="btn btn--primary" type="submit">Submit review</button></div>
      </form>`,
    });
    $("[data-review-form]", sheet.el).addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await S.submitReview({ productId: p.id, rating: fd.get("rating"), title: fd.get("title"), body: fd.get("body") });
        sheet.close();
        toast("Thank you. Your review will appear once our team has checked it.");
      } catch (err) {
        $("[data-error]", sheet.el).textContent = err.message;
      }
    });
  }

  // ---------- Cart ----------
  function cartLines(qt, compact = false) {
    return `<div class="lines">${qt.lines
      .map((l) => {
        const p = l.p;
        return `<div class="line ${compact ? "line--compact" : ""}">
          <a class="line__img" href="#/p/${p.slug}"><img src="${imgUrl(p.images[0], 200)}" alt="" loading="lazy"></a>
          <div>
            <p class="line__title"><a href="#/p/${p.slug}">${esc(p.title)}</a></p>
            <p class="line__meta">${esc(p.short)} · ${money(l.unit)} each${l.promo ? ` · ${esc(l.promo.name)}` : ""}</p>
            <div class="line__controls">
              ${l.qty > 0 ? stepper(l.qty, l.limit, `${compact ? "sm" : ""} data-cart-qty="${p.sku}" data-focus-key="qty-${p.sku}"`) : `<span class="stock stock--out">Sold out</span>`}
              <button class="line__remove" type="button" data-cart-remove="${p.sku}">${icon("trash")} Remove</button>
            </div>
          </div>
          <p class="line__price">${money(l.lineTotal)}${l.promo ? `<s>${money(l.lineRegular)}</s>` : ""}</p>
        </div>`;
      })
      .join("")}</div>`;
  }

  function totalsHtml(qt, { pincodeField = false } = {}) {
    const promoNames = [...new Set(qt.sellable.filter((l) => l.promo).map((l) => l.promo.name))];
    return `<dl class="totals">
      <div><dt>Items (${qt.count})</dt><dd>${money(qt.regularTotal)}</dd></div>
      ${qt.autoDiscount ? `<div class="discount"><dt>Offers<small>${esc(promoNames.join(", "))}</small></dt><dd>−${money(qt.autoDiscount)}</dd></div>` : ""}
      ${qt.coupon?.ok ? `<div class="discount"><dt>Coupon ${esc(qt.coupon.code)}</dt><dd>−${money(qt.couponAmount)}</dd></div>` : ""}
      <div><dt>Shipping${qt.ship?.serviceable ? `<small>${esc(qt.ship.zone.name)} · est. ${esc(qt.ship.eta)}</small>` : pincodeField ? "<small>Enter your pincode</small>" : ""}</dt><dd>${qt.ship?.serviceable ? (qt.shipping ? money(qt.shipping) : "Free") : "—"}</dd></div>
      <div class="grand"><dt>Total<small>Includes ${money(qt.tax)} GST</small></dt><dd>${money(qt.total)}</dd></div>
    </dl>`;
  }

  function couponHtml(qt) {
    const c = S.cart.get();
    if (c.coupon && qt.coupon?.ok) return `<div class="coupon-applied"><span>${icon("tag")} <strong>${esc(qt.coupon.code)}</strong> applied (−${money(qt.couponAmount)})</span><button class="link" type="button" data-coupon-remove>Remove</button></div>`;
    return `<form class="coupon-form" data-coupon-form><input name="code" placeholder="Coupon code" aria-label="Coupon code" value="${esc(c.coupon || "")}"><button class="btn btn--ghost btn--sm" type="submit">Apply</button></form>
      ${c.coupon && qt.coupon && !qt.coupon.ok ? `<p class="field__error" role="alert">${esc(qt.coupon.message)}</p>` : ""}`;
  }

  function issuesHtml(issues) {
    if (!issues.length) return "";
    return `<div class="notice notice--warn" role="alert">${icon("alert")}<div><strong>Some things changed since you added them:</strong>
      <ul>${issues.map((i) => `<li>${esc(i.message)}</li>`).join("")}</ul>
      <button class="btn btn--dark btn--sm" type="button" data-ack style="margin-top:10px">OK, update my cart</button></div></div>`;
  }

  function wireCartControls(el) {
    $("[data-coupon-form]", el)?.addEventListener("submit", (e) => {
      e.preventDefault();
      S.cart.setCoupon(e.target.code.value);
    });
    $("[data-coupon-remove]", el)?.addEventListener("click", () => S.cart.setCoupon(null));
    $("[data-ack]", el)?.addEventListener("click", () => {
      S.cart.acknowledge(S.quote());
      toast("Cart updated with current prices and stock.", "info");
    });
    $("[data-pin-form]", el)?.addEventListener("submit", (e) => {
      e.preventDefault();
      S.cart.setPincode(e.target.pin.value);
    });
  }

  function viewCart() {
    const qt = S.quote();
    if (!qt.lines.length)
      return {
        title: "Cart — NIRAH",
        live: true,
        html: `<div class="container">${emptyState("bag", "Your cart is empty", "Everything in the shop is in stock and ready to ship.", '<a class="btn btn--primary" href="#/shop">Start shopping</a>')}</div>`,
      };
    const pin = S.cart.get().pincode;
    return {
      title: "Cart — NIRAH",
      live: true,
      html: `<div class="container"><header class="page-head">${crumbs([["Home", "#/"], ["Cart", ""]])}<h1 class="page-title">Your cart</h1></header>
        <div class="two-col">
          <section aria-label="Items">${issuesHtml(qt.issues)}<div style="height:${qt.issues.length ? 20 : 0}px"></div>${cartLines(qt)}
            <a class="link" href="#/shop" style="display:inline-block;margin-top:20px">Continue shopping</a></section>
          <aside class="summary" aria-label="Order summary">
            <h2>Summary</h2>
            ${couponHtml(qt)}
            <form class="coupon-form" data-pin-form><input name="pin" inputmode="numeric" maxlength="6" placeholder="Pincode for delivery" aria-label="Delivery pincode" value="${esc(pin)}" style="text-transform:none"><button class="btn btn--ghost btn--sm" type="submit">Update</button></form>
            ${qt.ship && !qt.ship.serviceable ? `<p class="field__error">${esc(qt.ship.message)}</p>` : ""}
            ${totalsHtml(qt, { pincodeField: true })}
            ${qt.belowMinimum ? `<p class="notice notice--warn">${icon("info")} Minimum order value is ${money(S.db.settings.orderMinimum)}.</p>` : ""}
            <a class="btn btn--primary btn--lg btn--block ${qt.issues.length || qt.belowMinimum || !qt.sellable.length ? "is-disabled" : ""}" href="#/checkout" ${qt.issues.length || qt.belowMinimum || !qt.sellable.length ? 'aria-disabled="true" onclick="return false" style="opacity:.45;pointer-events:none"' : ""}>${icon("lock")} Proceed to checkout</a>
            <p class="field__hint">Prices and stock are checked again before you pay.</p>
          </aside>
        </div></div>`,
      mount: wireCartControls,
    };
  }

  // ---------- Checkout ----------
  const STATES = ["Andhra Pradesh", "Assam", "Bihar", "Chandigarh", "Chhattisgarh", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Tamil Nadu", "Telangana", "Uttar Pradesh", "Uttarakhand", "West Bengal"];
  let checkoutDraft = null;

  function viewCheckout() {
    const qt0 = S.quote();
    if (!qt0.lines.length) return { title: "Checkout — NIRAH", html: `<div class="container">${emptyState("bag", "Nothing to check out", "Your cart is empty.", '<a class="btn btn--primary" href="#/shop">Go shopping</a>')}</div>` };
    const me = S.currentCustomer();
    const addr = me?.addresses?.[0];
    const d = (checkoutDraft = checkoutDraft || {
      name: me?.name || "",
      email: me?.email || "",
      phone: me?.phone || "",
      addressId: addr?.id || "new",
      line1: "",
      line2: "",
      city: "",
      state: "",
      pincode: S.cart.get().pincode || "",
      method: "upi",
      marketingConsent: false,
    });
    if (me && !d.email) Object.assign(d, { name: me.name, email: me.email, phone: me.phone });
    const methods = S.db.settings.paymentMethods;
    const methodInfo = { upi: ["UPI", "Pay with any UPI app"], card: ["Card", "Credit or debit card"], netbanking: ["Net banking", "All major banks"], wallet: ["Wallet", "Supported wallets"] };
    const field = (name, label, attrs = "", full = false) => `<label class="field ${full ? "span-2" : ""}" data-field="${name}"><span class="field__label">${label}</span><input name="${name}" value="${esc(d[name] || "")}" ${attrs}><span class="field__error" data-err="${name}"></span></label>`;

    return {
      title: "Checkout — NIRAH",
      onData: () => updateSummary(),
      html: `<div class="container"><header class="page-head">${crumbs([["Cart", "#/cart"], ["Checkout", ""]])}<h1 class="page-title">Checkout</h1></header>
        <div class="two-col">
          <form data-checkout novalidate>
            <ol class="steps" aria-label="Checkout progress"><li data-step-ind="1">1. Your details</li><li data-step-ind="2">2. Delivery</li><li data-step-ind="3">3. Payment</li></ol>
            <section class="panel" aria-labelledby="co-1">
              <div class="panel__head"><h2 class="panel__title" id="co-1"><span class="panel__num">1</span>Your details</h2>
                ${me ? `<span class="field__hint">Signed in as ${esc(me.email)}</span>` : `<button class="link" type="button" data-signin-inline>Have an account? Sign in</button>`}</div>
              <div class="form-grid">
                ${field("name", "Full name", 'autocomplete="name" required')}
                ${field("phone", "Mobile number", 'autocomplete="tel" inputmode="tel" required placeholder="10-digit mobile"')}
                ${field("email", "Email", 'type="email" autocomplete="email" required', true)}
                <label class="check span-2"><input type="checkbox" name="marketingConsent" ${d.marketingConsent ? "checked" : ""}> <span>Send me occasional emails about new arrivals and offers. <span class="field__hint">Optional. Order updates are sent regardless.</span></span></label>
              </div>
            </section>
            <section class="panel" aria-labelledby="co-2">
              <div class="panel__head"><h2 class="panel__title" id="co-2"><span class="panel__num">2</span>Delivery address</h2></div>
              ${me?.addresses?.length ? `<div class="choice-list" style="margin-bottom:16px">${me.addresses.map((a) => `<label class="choice"><input type="radio" name="addressId" value="${a.id}" ${d.addressId === a.id ? "checked" : ""}><span><strong>${esc(a.label || "Saved address")} · ${esc(a.name || me.name)}</strong><small>${esc([a.line1, a.line2, a.city, a.state, a.pincode].filter(Boolean).join(", "))}</small></span></label>`).join("")}
                <label class="choice"><input type="radio" name="addressId" value="new" ${d.addressId === "new" ? "checked" : ""}><span><strong>Use a new address</strong></span></label></div>` : '<input type="hidden" name="addressId" value="new">'}
              <div class="form-grid" data-new-address ${me?.addresses?.length && d.addressId !== "new" ? "hidden" : ""}>
                ${field("line1", "House / flat and street", 'autocomplete="address-line1"', true)}
                ${field("line2", "Area, landmark (optional)", 'autocomplete="address-line2"', true)}
                ${field("city", "City", 'autocomplete="address-level2"')}
                <label class="field" data-field="state"><span class="field__label">State</span><select name="state" autocomplete="address-level1"><option value="">Choose…</option>${STATES.map((s) => `<option ${d.state === s ? "selected" : ""}>${s}</option>`).join("")}</select><span class="field__error" data-err="state"></span></label>
                ${field("pincode", "Pincode", 'inputmode="numeric" maxlength="6" autocomplete="postal-code"')}
                <p class="field__hint" data-pin-result style="align-self:end;padding-bottom:12px"></p>
                ${me ? `<label class="check span-2"><input type="checkbox" name="saveAddress" checked> <span>Save this address to my account</span></label>` : ""}
              </div>
            </section>
            <section class="panel" aria-labelledby="co-3">
              <div class="panel__head"><h2 class="panel__title" id="co-3"><span class="panel__num">3</span>Payment</h2><span class="field__hint">${icon("lock")} NIRAH Pay (sandbox)</span></div>
              <div class="choice-list">${Object.entries(methods).filter(([, on]) => on).map(([k]) => `<label class="choice"><input type="radio" name="method" value="${k}" ${d.method === k ? "checked" : ""}><span><strong>${methodInfo[k][0]}</strong><small>${methodInfo[k][1]}</small></span></label>`).join("")}</div>
              <p class="field__hint" style="margin-top:14px">You'll complete payment on our gateway partner's secure page. NIRAH never sees or stores your card or bank details. Your items are held for ${S.db.settings.reservationMinutes} minutes while you pay.</p>
              <label class="check" style="margin-top:18px" data-field="terms"><input type="checkbox" name="acceptTerms"> <span>I agree to the <a class="link" href="#/policy/terms" target="_blank">Terms</a>, <a class="link" href="#/policy/returns" target="_blank">Returns policy</a> and <a class="link" href="#/policy/privacy" target="_blank">Privacy policy</a>.</span></label>
              <p class="field__error" data-err="terms"></p>
              <div data-issues style="margin-top:16px"></div>
              <button class="btn btn--primary btn--lg btn--block" type="submit" style="margin-top:18px" data-pay>${icon("lock")} Pay securely</button>
            </section>
          </form>
          <aside class="summary" aria-label="Order summary" data-summary></aside>
        </div></div>`,
      mount(el) {
        const form = $("[data-checkout]", el);
        const sync = () => {
          const fd = new FormData(form);
          Object.assign(checkoutDraft, Object.fromEntries([...fd.entries()].filter(([k]) => k !== "acceptTerms")));
          checkoutDraft.marketingConsent = !!fd.get("marketingConsent");
          const useNew = (fd.get("addressId") || "new") === "new";
          $("[data-new-address]", el).hidden = !useNew;
        };
        form.addEventListener("input", () => {
          sync();
          updateSummary();
        });
        form.addEventListener("change", () => {
          sync();
          updateSummary();
        });
        $("[data-signin-inline]", el)?.addEventListener("click", (e) => openSignInSheet(e.currentTarget, () => render()));
        form.addEventListener("submit", async (e) => {
          e.preventDefault();
          sync();
          await submitCheckout(form, el);
        });
        updateSummary();
      },
    };
  }

  function checkoutAddress() {
    const me = S.currentCustomer();
    const d = checkoutDraft;
    const saved = me?.addresses?.find((a) => a.id === d.addressId);
    if (saved) return { line1: saved.line1, line2: saved.line2 || "", city: saved.city, state: saved.state, pincode: saved.pincode };
    return { line1: d.line1, line2: d.line2, city: d.city, state: d.state, pincode: d.pincode };
  }

  function updateSummary() {
    const host = $("[data-summary]", main);
    if (!host || !checkoutDraft) return;
    const address = checkoutAddress();
    const qt = S.quote(S.cart.get(), { pincode: address.pincode, email: checkoutDraft.email });
    const pinEl = $("[data-pin-result]", main);
    if (pinEl) {
      const sq = address.pincode?.length === 6 ? S.shippingQuote(address.pincode, qt.merchandise) : null;
      pinEl.textContent = sq ? (sq.serviceable ? `Delivers in est. ${sq.eta}` : sq.message) : "";
      pinEl.style.color = sq && !sq.serviceable ? "var(--danger)" : "";
    }
    const banner = S.db.settings.checkoutBanner;
    host.innerHTML = `<h2>Order summary</h2>${banner ? `<p class="notice">${icon("info")} ${esc(banner)}</p>` : ""}
      ${cartLines(qt, true)}${couponHtml(qt)}${totalsHtml(qt)}`;
    wireCartControls(host);
    const pay = $("[data-pay]", main);
    if (pay) pay.innerHTML = `${icon("lock")} Pay ${money(qt.total)} securely`;
    // Progress: details → delivery → payment.
    const d = checkoutDraft;
    const done1 = d.name && /\S+@\S+\.\S+/.test(d.email) && String(d.phone).replace(/\D/g, "").length >= 10;
    const done2 = address.line1 && address.city && address.state && qt.ship?.serviceable;
    $$("[data-step-ind]", main).forEach((li) => {
      const n = Number(li.dataset.stepInd);
      li.classList.toggle("is-done", (n === 1 && done1) || (n === 2 && done2));
      li.classList.toggle("is-current", (n === 1 && !done1) || (n === 2 && done1 && !done2) || (n === 3 && done1 && done2));
    });
    const iss = $("[data-issues]", main);
    if (iss) iss.innerHTML = issuesHtml(qt.issues);
    $("[data-ack]", main)?.addEventListener("click", () => {
      S.cart.acknowledge(S.quote());
      toast("Your cart now shows current prices and stock.", "info");
    });
    return qt;
  }

  async function submitCheckout(form, el) {
    $$("[data-err]", el).forEach((x) => (x.textContent = ""));
    $$(".has-error", el).forEach((x) => x.classList.remove("has-error"));
    const d = checkoutDraft;
    const qt = updateSummary();
    const btn = $("[data-pay]", el);
    btn.disabled = true;
    const label = btn.innerHTML;
    btn.innerHTML = '<span class="spinner" style="width:18px;height:18px;border-color:rgba(255,255,255,.4);border-top-color:#fff"></span> Holding your items…';
    try {
      const res = await S.placeOrder({
        name: d.name,
        email: d.email,
        phone: d.phone,
        address: checkoutAddress(),
        method: d.method || "upi",
        acceptTerms: form.acceptTerms.checked,
        marketingConsent: d.marketingConsent,
        saveAddress: !!form.saveAddress?.checked && d.addressId === "new",
        expectedTotal: qt.total,
      });
      if (res.ok) {
        S.track("checkout", "all");
        checkoutDraft = null;
        location.hash = `#/pay/${res.sessionId}`;
        return;
      }
      if (res.errors) {
        Object.entries(res.errors).forEach(([k, msg]) => {
          const err = $(`[data-err="${k}"]`, el);
          if (err) err.textContent = msg;
          $(`[data-field="${k}"]`, el)?.classList.add("has-error");
        });
        if (res.errors.line1 || res.errors.city || res.errors.state || res.errors.pincode) $("[data-new-address]", el).hidden = false;
        $(".has-error input, .has-error select, [data-field=terms] input", el)?.focus();
        toast("Please check the highlighted fields.", "error");
      } else if (res.issues) {
        $("[data-issues]", el).innerHTML = issuesHtml(res.issues);
        $("[data-issues] [data-ack]", el)?.addEventListener("click", () => {
          S.cart.acknowledge(S.quote(S.cart.get(), { pincode: checkoutAddress().pincode, email: d.email }));
          toast("Cart updated. Please review your total before paying.", "info");
        });
        $("[data-issues]", el).scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
      }
    } catch (err) {
      toast(err.message || "Something went wrong. Nothing has been charged.", "error");
    } finally {
      btn.disabled = false;
      btn.innerHTML = label;
    }
  }

  // ---------- Sandbox gateway page ----------
  function viewGateway([sessionId]) {
    const s = N.gateway.session(sessionId);
    if (!s) return view404("This payment link is not valid.");
    const order = S.db.orders.find((o) => o.id === s.merchantRef);
    const back = `#/order/${s.merchantRef}`;
    const methods = Object.entries(s.methods || {}).filter(([, on]) => on).map(([k]) => k);
    const labels = { upi: ["UPI", "spark"], card: ["Card", "card"], netbanking: ["Net banking", "home"], wallet: ["Wallet", "wallet"] };
    return {
      title: "NIRAH Pay — Secure payment",
      gateway: true,
      html: `<div class="gateway"><div class="gateway__card">
        <div class="gateway__top"><strong>${icon("lock")} NIRAH Pay</strong><span>Sandbox</span></div>
        <div class="gateway__body">
          <div><p class="gateway__merchant">Paying NIRAH Retail · Order ${esc(s.merchantRef)}</p><p class="gateway__amount">${money(s.amount)}</p>
          ${order?.reservedUntil ? `<p class="gateway__merchant" data-countdown="${order.reservedUntil}"></p>` : ""}</div>
          ${s.state !== "open" ? `<p class="gateway__note">This payment session is already ${esc(s.state)}. <a class="link" href="${back}">Return to NIRAH</a></p>` : `
          <div class="gateway__methods" role="radiogroup" aria-label="Payment method">${methods.map((m, i) => `<label><input type="radio" name="gm" value="${m}" ${(order?.method || methods[0]) === m || (!order && i === 0) ? "checked" : ""}>${icon(labels[m][1])}<span>${labels[m][0]}</span></label>`).join("")}</div>
          <p class="gateway__note">${icon("info")} Sandbox mode: no real money moves and no card or bank details are collected. Choose an outcome to see how NIRAH handles it.</p>
          <div class="gateway__actions">
            <button class="btn btn--pay btn--lg" type="button" data-outcome="success">Pay ${money(s.amount)}</button>
            <button class="btn btn--ghost" type="button" data-outcome="pending">Simulate slow bank confirmation</button>
            <button class="btn btn--ghost" type="button" data-outcome="failure">Simulate a declined payment</button>
            <a class="btn btn--ghost" href="${back}" data-abandon>Cancel and return to NIRAH</a>
          </div>`}
        </div>
        <div class="gateway__foot">Secured by NIRAH Pay sandbox · PCI-DSS handled by the provider · Session ${esc(s.id)}</div>
      </div></div>`,
      mount(el) {
        const cd = $("[data-countdown]", el);
        if (cd) {
          const tick = () => {
            const left = Number(cd.dataset.countdown) - Date.now();
            cd.textContent = left > 0 ? `Items held for ${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, "0")}` : "Hold expired: your items may have been released.";
          };
          tick();
          const t = setInterval(tick, 1000);
          cleanup.push(() => clearInterval(t));
        }
        $$("[data-outcome]", el).forEach((b) =>
          b.addEventListener("click", async () => {
            $$("[data-outcome]", el).forEach((x) => (x.disabled = true));
            b.innerHTML = '<span class="spinner" style="width:18px;height:18px"></span> Processing…';
            const method = $('input[name="gm"]:checked', el)?.value || "upi";
            await N.gateway.complete(sessionId, b.dataset.outcome, method);
            setTimeout(() => (location.hash = `${back}?from=gateway`), 700);
          })
        );
        $("[data-abandon]", el)?.addEventListener("click", () => N.gateway.abandon(sessionId));
      },
    };
  }

  // ---------- Order status, tracking, invoice ----------
  const FLOW = ["Placed", "Paid", "Processing", "Packed", "Shipped", "Delivered"];
  function timelineHtml(o) {
    const reached = (s) => o.history.find((h) => h.status === s);
    const steps = [...FLOW];
    if (["Return Requested", "Returned", "Refunded"].includes(o.status) || o.returnRequest) steps.push("Return Requested", "Returned", "Refunded");
    if (o.status === "Cancelled") return `<ol class="timeline">${["Placed", "Cancelled"].map((s) => `<li class="is-done"><span class="timeline__dot">${icon(s === "Cancelled" ? "close" : "check")}</span><div><strong>${s}</strong><small>${fmtDateTime(reached(s)?.at)}${reached(s)?.note ? ` · ${esc(reached(s).note)}` : ""}</small></div></li>`).join("")}</ol>`;
    return `<ol class="timeline">${steps
      .map((s) => {
        const h = reached(s);
        const note = s === "Shipped" && o.trackingId ? `${esc(o.courier)} · ${esc(o.trackingId)}` : h?.note || "";
        return `<li class="${h ? "is-done" : ""}"><span class="timeline__dot">${h ? icon("check") : ""}</span><div><strong>${s}</strong><small>${h ? fmtDateTime(h.at) : s === "Delivered" && o.status === "Shipped" ? `Estimated ${esc(o.eta)}` : "Pending"}${note ? ` · ${note}` : ""}</small></div></li>`;
      })
      .join("")}</ol>`;
  }

  function orderTotals(o) {
    return `<dl class="totals">
      <div><dt>Items</dt><dd>${money(o.regularTotal)}</dd></div>
      ${o.autoDiscount ? `<div class="discount"><dt>Offers<small>${esc([...new Set(o.lines.filter((l) => l.promoName).map((l) => l.promoName))].join(", "))}</small></dt><dd>−${money(o.autoDiscount)}</dd></div>` : ""}
      ${o.coupon ? `<div class="discount"><dt>Coupon ${esc(o.coupon.code)}</dt><dd>−${money(o.coupon.amount)}</dd></div>` : ""}
      <div><dt>Shipping<small>${esc(o.shippingZone)}</small></dt><dd>${o.shipping ? money(o.shipping) : "Free"}</dd></div>
      <div class="grand"><dt>${o.paymentState === "paid" || o.paymentState === "refunded" ? "Total paid" : "Total"}<small>Includes ${money(o.tax)} GST</small></dt><dd>${money(o.total)}</dd></div>
    </dl>`;
  }

  function printInvoice(o) {
    const b = S.db.settings.business;
    const rows = o.lines
      .map((l) => {
        const gross = l.unit * l.qty - (l.couponShare || 0);
        return `<tr><td>${esc(l.title)}<br><span class="muted">${esc(l.sku)}</span></td><td class="r">${l.qty}</td><td class="r">${money(l.unit)}</td><td class="r">${l.taxRate}%</td><td class="r">${money(l.tax)}</td><td class="r">${money(gross)}</td></tr>`;
      })
      .join("");
    printDocument(`Invoice ${o.id}`, `
      <h1>NIRAH</h1><p class="muted">${esc(b.name)} · ${esc(b.address)} · GSTIN ${esc(b.gstin)}</p>
      <h2>Tax invoice / receipt · ${esc(o.id)}</h2>
      <div class="grid"><div><strong>Billed to</strong><br>${esc(o.name)}<br>${esc(o.address.line1)}${o.address.line2 ? `, ${esc(o.address.line2)}` : ""}<br>${esc(o.address.city)}, ${esc(o.address.state)} ${esc(o.address.pincode)}<br>${esc(o.email)} · ${esc(o.phone)}</div>
      <div><strong>Order date</strong> ${fmtDate(o.createdAt)}<br><strong>Payment</strong> ${esc(o.method?.toUpperCase() || "")} · ${esc(o.paymentState)}<br><strong>Transaction</strong> ${esc(S.db.payments.find((p) => p.orderId === o.id && p.gatewayTxnId)?.gatewayTxnId || "—")}</div></div>
      <table><thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Unit</th><th class="r">GST</th><th class="r">GST amt</th><th class="r">Amount</th></tr></thead><tbody>${rows}</tbody></table>
      <table class="tot" style="width:320px;margin-left:auto">
        ${o.coupon ? `<tr><td>Coupon ${esc(o.coupon.code)}</td><td class="r">included above</td></tr>` : ""}
        <tr><td>Shipping</td><td class="r">${money(o.shipping)}</td></tr>
        <tr><td>GST included</td><td class="r">${money(o.tax)}</td></tr>
        <tr><td class="big">Total</td><td class="r big">${money(o.total)}</td></tr></table>
      <p class="muted" style="margin-top:24px">Prototype invoice. Final tax invoicing format is to be confirmed with the business's accountant.</p>`);
  }

  function viewOrder([id], q) {
    const o = S.orderFor(id);
    if (!o) {
      return {
        title: "Order — NIRAH",
        html: `<div class="container" style="max-width:640px;padding-bottom:96px"><header class="page-head"><h1 class="page-title">Find your order</h1><p class="page-lede">For your privacy, order details are shown only to the person who placed it. Sign in, or confirm the email or phone used at checkout.</p></header>${trackForm(id)}</div>`,
        mount: wireTrackForm,
      };
    }
    const session = S.db.payments.filter((p) => p.orderId === o.id).sort((a, b) => b.createdAt - a.createdAt)[0];
    const gw = session?.sessionId ? N.gateway.session(session.sessionId) : null;
    let hero;
    if (o.status === "Cancelled") hero = ["bad", "close", "This order was cancelled", o.paymentState === "refunded" || S.db.refunds.some((r) => r.orderId === o.id) ? "Any payment taken is refunded to your original payment method. Refunds usually reach you within a few working days, depending on your bank." : "No payment was taken."];
    else if (o.paymentState === "paid" || o.paymentState === "refunded") hero = ["ok", "check", q.from === "gateway" ? "Thank you! Your order is confirmed" : `Order ${o.status.toLowerCase()}`, q.from === "gateway" ? `We've received your payment and confirmed order ${o.id}. A confirmation will be sent to ${o.email} (email sending is simulated in this prototype).` : `Order ${o.id}, placed on ${fmtDate(o.createdAt)}.`];
    else if (o.paymentState === "pending" && gw && ["captured", "processing"].includes(gw.state)) hero = ["wait", "clock", "Verifying your payment…", "We're waiting for the payment gateway to confirm. This page updates automatically. Please don't pay again."];
    else if (o.paymentState === "pending") hero = ["wait", "clock", "Payment not completed", "Your items are held for a short time. Complete the payment to confirm your order."];
    else if (o.paymentState === "failed") hero = ["bad", "alert", "Payment failed", "The payment was declined and nothing was charged. Your held items were released; we'll check availability again if you try once more."];
    else if (o.paymentState === "expired") hero = ["bad", "clock", "Payment window expired", "The hold on your items ended before payment was completed. Nothing was charged. You can try again and we'll re-check stock."];
    else if (o.paymentState === "review") hero = ["wait", "info", "We're checking your payment", "Something didn't match on the gateway's confirmation. Our team will review it; you don't need to do anything."];
    else hero = ["wait", "info", `Order ${o.status}`, ""];
    const [tone, ic, title, text] = hero;
    const canRetry = ["failed", "expired"].includes(o.paymentState) || (o.paymentState === "pending" && (!gw || gw.state === "open" || gw.state === "abandoned"));
    const verifying = o.paymentState === "pending" && gw && ["captured", "processing"].includes(gw.state);
    const canCancel = (o.status === "Placed" && o.paymentState !== "paid" && !verifying) || (["Paid", "Processing"].includes(o.status) && o.cancelRequest?.state !== "requested");
    const ret = S.returnEligibility(o);
    const me = S.currentCustomer();
    return {
      title: `Order ${o.id} — NIRAH`,
      live: true,
      html: `<div class="container" style="padding-bottom:96px"><header class="page-head">${crumbs([["Home", "#/"], ...(me ? [["My account", "#/account"]] : []), [`Order ${o.id}`, ""]])}</header>
        <div class="result-hero result-hero--${tone}" data-reveal>
          <span class="result-hero__icon">${tone === "wait" && ic === "clock" && title.startsWith("Verifying") ? '<span class="spinner"></span>' : icon(ic)}</span>
          <h1>${esc(title)}</h1><p>${esc(text)}</p>
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            ${canRetry && o.status !== "Cancelled" ? `<button class="btn btn--primary" type="button" data-retry>${icon("refresh")} ${o.paymentState === "pending" ? "Complete payment" : "Try payment again"}</button>` : ""}
            ${o.paymentState === "paid" || o.paymentState === "refunded" ? `<button class="btn btn--ghost" type="button" data-invoice>${icon("download")} Invoice / receipt</button>` : ""}
            ${canCancel ? `<button class="btn btn--ghost" type="button" data-cancel>${o.status === "Placed" ? "Cancel order" : "Request cancellation"}</button>` : ""}
            ${ret.ok && !o.returnRequest ? `<button class="btn btn--ghost" type="button" data-return>Request a return</button>` : ""}
          </div>
          ${o.cancelRequest ? `<p class="notice">${icon("info")} Cancellation ${esc(o.cancelRequest.state)}: ${esc(o.cancelRequest.reason)}</p>` : ""}
          ${o.returnRequest ? `<p class="notice">${icon("info")} Return ${esc(o.returnRequest.state)}: ${esc(o.returnRequest.reason)}</p>` : ""}
        </div>
        <div class="two-col" style="margin-top:20px;padding-bottom:0">
          <div>
            <section class="panel"><div class="panel__head"><h2 class="panel__title">Items</h2><span class="field__hint">Prices as charged</span></div>
              <div class="lines">${o.lines.map((l) => {
                const p = S.productById(l.productId);
                const canReview = me && o.status === "Delivered" && p && S.reviewEligibility(p.id).ok;
                return `<div class="line line--compact"><span class="line__img"><img src="${imgUrl(l.image, 120)}" alt=""></span>
                <div><p class="line__title">${p && S.isPublic(p) ? `<a href="#/p/${p.slug}">${esc(l.title)}</a>` : esc(l.title)}</p><p class="line__meta">${l.qty} × ${money(l.unit)}${l.promoName ? ` · ${esc(l.promoName)}` : ""}${l.returnable ? "" : " · non-returnable"}</p>
                ${canReview ? `<a class="link" href="#/p/${p.slug}#reviews" data-review-link="${p.slug}" style="font-size:13.5px">Write a review</a>` : ""}</div>
                <p class="line__price">${money(l.unit * l.qty)}</p></div>`;
              }).join("")}</div></section>
            <section class="panel"><div class="panel__head"><h2 class="panel__title">Tracking</h2>${o.trackingId ? `<span class="field__hint">${esc(o.courier)} · ${esc(o.trackingId)}</span>` : ""}</div>${timelineHtml(o)}</section>
          </div>
          <aside class="summary">
            <h2>Order ${esc(o.id)}</h2>
            <span class="status ${o.status === "Delivered" || o.status === "Paid" ? "status--ok" : o.status === "Cancelled" ? "status--bad" : "status--info"}">${esc(o.status)}</span>
            ${orderTotals(o)}
            <dl class="kv"><dt>Deliver to</dt><dd>${esc(o.name)}<br>${esc(o.address.line1)}${o.address.line2 ? `, ${esc(o.address.line2)}` : ""}<br>${esc(o.address.city)}, ${esc(o.address.state)} ${esc(o.address.pincode)}</dd>
            <dt style="margin-top:10px">Estimated delivery</dt><dd>${esc(o.eta)} after dispatch</dd>
            <dt style="margin-top:10px">Payment</dt><dd>${esc((o.method || "").toUpperCase())} · ${esc(o.paymentState)}</dd></dl>
            <a class="link" href="#/contact?order=${o.id}">Need help with this order?</a>
          </aside>
        </div></div>`,
      mount(el) {
        $("[data-retry]", el)?.addEventListener("click", async (e) => {
          e.currentTarget.disabled = true;
          try {
            const res = await S.retryPayment(o.id);
            location.hash = `#/pay/${res.sessionId}`;
          } catch (err) {
            toast(err.message, "error");
            e.currentTarget.disabled = false;
          }
        });
        $("[data-invoice]", el)?.addEventListener("click", () => printInvoice(o));
        $("[data-cancel]", el)?.addEventListener("click", async (e) => {
          const reason = await confirmDialog({ title: o.status === "Placed" ? "Cancel this order?" : "Request cancellation?", body: o.status === "Placed" ? "Your held items will be released. Nothing has been charged." : "We'll cancel and refund in full if the order hasn't been packed yet.", confirm: o.status === "Placed" ? "Cancel order" : "Send request", danger: true, input: { label: "Reason", required: true } });
          if (!reason) return;
          try {
            await S.requestCancel(o.id, reason);
            toast(o.status === "Placed" ? "Order cancelled." : "Cancellation requested. We'll email you once it's processed.");
          } catch (err) {
            toast(err.message, "error");
          }
          void e;
        });
        $("[data-return]", el)?.addEventListener("click", async () => {
          const reason = await confirmDialog({ title: "Request a return", body: `Returnable items can be sent back within ${S.db.settings.returnWindowDays} days of delivery, unused and in original packaging. We'll refund after inspection.`, confirm: "Request return", input: { label: "What's the reason?", required: true, type: "textarea" } });
          if (!reason) return;
          try {
            await S.requestReturn(o.id, reason);
            toast("Return requested. We'll email pickup details.");
          } catch (err) {
            toast(err.message, "error");
          }
        });
      },
    };
  }

  function trackForm(prefill = "") {
    return `<form class="panel" data-track-form>
      <div class="form-grid">
        <label class="field"><span class="field__label">Order number</span><input name="order" value="${esc(prefill)}" placeholder="e.g. NRH-10150" required></label>
        <label class="field"><span class="field__label">Email or mobile used at checkout</span><input name="contact" required></label>
      </div>
      <p class="field__error" data-error role="alert" style="margin-top:10px"></p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px"><button class="btn btn--primary" type="submit">Find my order</button><a class="btn btn--ghost" href="#/account">Sign in instead</a></div>
    </form>`;
  }
  function wireTrackForm(el) {
    $("[data-track-form]", el)?.addEventListener("submit", (e) => {
      e.preventDefault();
      try {
        const o = S.lookupOrder(e.target.order.value, e.target.contact.value);
        location.hash = `#/order/${o.id}`;
      } catch (err) {
        $("[data-error]", el).textContent = err.message;
      }
    });
  }
  function viewTrack() {
    return {
      title: "Track an order — NIRAH",
      html: `<div class="container" style="max-width:640px;padding-bottom:96px"><header class="page-head">${crumbs([["Home", "#/"], ["Track an order", ""]])}<h1 class="page-title">Track an order</h1><p class="page-lede">No account needed. Enter your order number and the email or mobile number you used at checkout.</p></header>${trackForm()}</div>`,
      mount: wireTrackForm,
    };
  }

  // ---------- Account ----------
  function signInForms(next = "") {
    return `<div class="two-col" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr));padding-bottom:96px">
      <form class="panel" data-signin>
        <h2 class="panel__title" style="margin-bottom:18px">Sign in</h2>
        <div style="display:grid;gap:14px">
          <label class="field"><span class="field__label">Email</span><input name="email" type="email" autocomplete="email" required></label>
          <label class="field"><span class="field__label">Password</span><input name="password" type="password" autocomplete="current-password" required></label>
          <p class="field__error" data-error role="alert"></p>
          <button class="btn btn--primary" type="submit">Sign in</button>
          <p class="field__hint">Demo account: asha@example.com / demo1234</p>
        </div>
        <input type="hidden" name="next" value="${esc(next)}">
      </form>
      <form class="panel" data-register>
        <h2 class="panel__title" style="margin-bottom:18px">Create an account</h2>
        <div style="display:grid;gap:14px">
          <label class="field"><span class="field__label">Full name</span><input name="name" autocomplete="name" required></label>
          <label class="field"><span class="field__label">Email</span><input name="email" type="email" autocomplete="email" required></label>
          <label class="field"><span class="field__label">Mobile (optional)</span><input name="phone" inputmode="tel" autocomplete="tel"></label>
          <label class="field"><span class="field__label">Password</span><input name="password" type="password" autocomplete="new-password" minlength="8" required><span class="field__hint">At least 8 characters.</span></label>
          <label class="check"><input type="checkbox" name="marketingConsent"> <span>Email me about new arrivals and offers (optional)</span></label>
          <p class="field__error" data-error role="alert"></p>
          <button class="btn btn--dark" type="submit">Create account</button>
          <p class="field__hint">Shopping without an account? You can check out as a guest and <a class="link" href="#/track">track orders</a> with your order number.</p>
        </div>
      </form></div>`;
  }
  function wireSignIn(el, after) {
    $("[data-signin]", el)?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      try {
        await S.signIn(f.email.value, f.password.value);
        toast("Welcome back.");
        after?.(f.next?.value);
      } catch (err) {
        $("[data-error]", f).textContent = err.message;
      }
    });
    $("[data-register]", el)?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      try {
        await S.register({ name: f.name.value, email: f.email.value, phone: f.phone.value, password: f.password.value, marketingConsent: f.marketingConsent.checked });
        toast("Your account is ready.");
        after?.();
      } catch (err) {
        $("[data-error]", f).textContent = err.message;
      }
    });
  }
  function openSignInSheet(origin, after) {
    const sheet = openSheet({ title: "Sign in", side: "center", origin, html: signInForms().replace("two-col", "").replace("padding-bottom:96px", "display:grid;gap:12px") });
    wireSignIn(sheet.el, () => {
      sheet.close();
      after?.();
    });
  }

  function viewAccount(_, q) {
    const me = S.currentCustomer();
    if (!me)
      return {
        title: "Sign in — NIRAH",
        html: `<div class="container"><header class="page-head">${crumbs([["Home", "#/"], ["My account", ""]])}<h1 class="page-title">My account</h1><p class="page-lede">Sign in to see your orders, saved addresses and preferences. You never need an account to browse.</p></header>${signInForms(q.next || "")}</div>`,
        mount: (el) => wireSignIn(el, (next) => (location.hash = next ? `#${next}` : "#/account")),
      };
    const tab = q.tab || "orders";
    const orders = S.ordersForCustomer();
    const tabs = [
      ["orders", "Orders"],
      ["addresses", "Addresses"],
      ["profile", "Profile & privacy"],
    ];
    let body = "";
    if (tab === "orders") {
      body = orders.length
        ? orders
            .map(
              (o) => `<a class="order-card" href="#/order/${o.id}">
            <span class="order-card__thumbs">${o.lines.slice(0, 3).map((l) => `<img src="${imgUrl(l.image, 112)}" alt="">`).join("")}</span>
            <span><strong>${esc(o.id)}</strong> <span class="field__hint">· ${fmtDate(o.createdAt)} · ${o.lines.reduce((s, l) => s + l.qty, 0)} item(s)</span><br><span class="field__hint">${esc(o.lines.map((l) => l.title).join(", "))}</span></span>
            <span style="display:grid;justify-items:end;gap:6px"><span class="status ${o.status === "Delivered" ? "status--ok" : o.status === "Cancelled" ? "status--bad" : "status--info"}">${esc(o.paymentState === "pending" || o.paymentState === "failed" || o.paymentState === "expired" ? "Payment " + o.paymentState : o.status)}</span><strong>${money(o.total)}</strong></span></a>`
            )
            .join("")
        : emptyState("bag", "No orders yet", "When you place an order it will show up here.", '<a class="btn btn--primary" href="#/shop">Start shopping</a>');
    } else if (tab === "addresses") {
      body = `<div style="display:grid;gap:10px">${me.addresses
        .map((a) => `<div class="order-card" style="grid-template-columns:1fr auto"><span><strong>${esc(a.label || "Address")}</strong> · ${esc(a.name || me.name)}<br><span class="field__hint">${esc([a.line1, a.line2, a.city, a.state, a.pincode].filter(Boolean).join(", "))}</span></span><button class="btn btn--ghost btn--sm" type="button" data-remove-address="${a.id}">${icon("trash")} Remove</button></div>`)
        .join("") || '<p class="field__hint">No saved addresses yet.</p>'}</div>
        <form class="panel" data-address-form style="margin-top:20px"><h3 class="panel__title" style="margin-bottom:16px">Add an address</h3><div class="form-grid">
          <label class="field"><span class="field__label">Label</span><input name="label" placeholder="Home, Work…"></label>
          <label class="field"><span class="field__label">Recipient name</span><input name="name" value="${esc(me.name)}" required></label>
          <label class="field span-2"><span class="field__label">House / flat and street</span><input name="line1" required></label>
          <label class="field span-2"><span class="field__label">Area, landmark</span><input name="line2"></label>
          <label class="field"><span class="field__label">City</span><input name="city" required></label>
          <label class="field"><span class="field__label">State</span><select name="state" required><option value="">Choose…</option>${STATES.map((s) => `<option>${s}</option>`).join("")}</select></label>
          <label class="field"><span class="field__label">Pincode</span><input name="pincode" inputmode="numeric" maxlength="6" required></label>
          <label class="field"><span class="field__label">Phone</span><input name="phone" inputmode="tel" value="${esc(me.phone || "")}"></label>
        </div><p class="field__error" data-error></p><button class="btn btn--primary" type="submit" style="margin-top:16px">Save address</button></form>`;
    } else {
      body = `<form class="panel" data-profile-form><div class="form-grid">
        <label class="field"><span class="field__label">Full name</span><input name="name" value="${esc(me.name)}" required></label>
        <label class="field"><span class="field__label">Mobile</span><input name="phone" value="${esc(me.phone || "")}" inputmode="tel"></label>
        <label class="field span-2"><span class="field__label">Email</span><input value="${esc(me.email)}" disabled><span class="field__hint">Used for order confirmations and updates.</span></label>
        <label class="check span-2"><input type="checkbox" name="marketingConsent" ${me.marketingConsent ? "checked" : ""}> <span><strong>Marketing emails</strong><br><span class="field__hint">New arrivals and offers, now and then. This is separate from order and payment messages, which we always send.</span></span></label>
      </div><button class="btn btn--primary" type="submit" style="margin-top:18px">Save changes</button></form>`;
    }
    return {
      title: "My account — NIRAH",
      live: true,
      html: `<div class="container" style="padding-bottom:96px"><header class="page-head">${crumbs([["Home", "#/"], ["My account", ""]])}
        <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-end;gap:16px"><div><h1 class="page-title">Hello, ${esc(me.name.split(" ")[0])}</h1><p class="page-lede">${esc(me.email)}</p></div><button class="btn btn--ghost" type="button" data-signout>${icon("logout")} Sign out</button></div></header>
        <div class="tabs" role="tablist" style="margin-bottom:22px">${tabs.map(([k, l]) => `<a role="tab" href="#/account?tab=${k}" aria-selected="${k === tab}">${l}</a>`).join("")}</div>
        <div role="tabpanel">${body}</div></div>`,
      mount(el) {
        $("[data-signout]", el).addEventListener("click", () => {
          S.signOut();
          toast("Signed out.");
        });
        $$("[data-remove-address]", el).forEach((b) => b.addEventListener("click", () => S.updateCustomer({ removeAddress: b.dataset.removeAddress })));
        $("[data-address-form]", el)?.addEventListener("submit", async (e) => {
          e.preventDefault();
          const a = Object.fromEntries(new FormData(e.target));
          const ship = S.shippingQuote(a.pincode);
          if (!ship.serviceable) return ($("[data-error]", e.target).textContent = ship.message);
          await S.updateCustomer({ address: a });
          toast("Address saved.");
        });
        $("[data-profile-form]", el)?.addEventListener("submit", async (e) => {
          e.preventDefault();
          const f = e.target;
          await S.updateCustomer({ name: f.name.value, phone: f.phone.value, marketingConsent: f.marketingConsent.checked });
          toast("Profile updated.");
        });
      },
    };
  }

  // ---------- About, FAQ, contact, policies ----------
  function viewAbout() {
    const c = site();
    return {
      title: "About NIRAH",
      description: c.about.intro,
      html: `<div class="container" style="padding-bottom:96px"><header class="page-head">${crumbs([["Home", "#/"], ["About NIRAH", ""]])}
        <div class="about-hero"><img src="${imgUrl("https://images.unsplash.com/photo-1556228453-efd6c1ff04f6", 1800, 900)}" alt="A calm, well-furnished living room"><h1>${esc(c.about.title)}</h1></div></header>
        <div class="prose" data-reveal style="margin-top:8px"><p class="lead">${esc(c.about.intro)}</p><p>${esc(c.about.story)}</p></div>
        <section class="band"><h2 class="section-title" style="font-size:36px">Our curation standards</h2>
          <ol class="standards" data-reveal-group>${c.about.standards.map(([h, p], i) => `<li><b>0${i + 1}</b><h3>${esc(h)}</h3><p>${esc(p)}</p></li>`).join("")}</ol></section>
        <section class="band prose" data-reveal><h2>Our delivery commitment</h2><p>${esc(c.about.delivery)}</p>
          <p>We don't make claims we can't back up: no unverified certifications, test results or guaranteed delivery dates. When a manufacturer's test is quoted on a product page, we say so.</p>
          <p style="margin-top:24px"><a class="btn btn--primary" href="#/shop">Shop the range</a> <a class="btn btn--ghost" href="#/contact">Talk to us</a></p></section>
      </div>`,
    };
  }
  function viewFaq() {
    const c = site();
    return {
      title: "FAQs — NIRAH",
      html: `<div class="container" style="max-width:860px;padding-bottom:96px"><header class="page-head">${crumbs([["Home", "#/"], ["FAQs", ""]])}<h1 class="page-title">Frequently asked questions</h1></header>
        <div class="faq">${c.faqs.map(([qq, a], i) => `<details ${i === 0 ? "open" : ""}><summary>${esc(qq)} ${icon("plus")}</summary><p>${esc(a)}</p></details>`).join("")}</div>
        <p class="notice" style="margin-top:32px">${icon("chat")} <span>Can't find your answer? <a class="link" href="#/contact">Send us a message</a> and our team will reply by email.</span></p></div>`,
    };
  }
  function viewContact(_, q) {
    const b = S.db.settings.business;
    return {
      title: "Contact & feedback — NIRAH",
      html: `<div class="container"><header class="page-head">${crumbs([["Home", "#/"], ["Contact", ""]])}<h1 class="page-title">Contact &amp; feedback</h1><p class="page-lede">Questions about a product, a delivery concern or a suggestion for what we should stock: it all reaches the same small team.</p></header>
        <div class="contact-grid">
          <form class="panel" data-contact-form><div class="form-grid">
            <label class="field span-2"><span class="field__label">What is this about?</span><select name="topic"><option value="product">Product question</option><option value="delivery" ${q.order ? "selected" : ""}>Delivery or order concern</option><option value="suggestion">Suggestion or feedback</option><option value="other">Something else</option></select></label>
            <label class="field"><span class="field__label">Your name</span><input name="name" value="${esc(S.currentCustomer()?.name || "")}" required></label>
            <label class="field"><span class="field__label">Email</span><input name="email" type="email" value="${esc(S.currentCustomer()?.email || "")}" required></label>
            <label class="field span-2"><span class="field__label">Order number (optional)</span><input name="orderId" value="${esc(q.order || "")}" placeholder="NRH-…"></label>
            <label class="field span-2"><span class="field__label">Message</span><textarea name="message" required minlength="10"></textarea></label>
          </div><p class="field__error" data-error role="alert"></p><button class="btn btn--primary" type="submit" style="margin-top:16px">Send message</button></form>
          <dl class="contact-card"><div><dt>Email</dt><dd>${esc(b.email)}</dd></div><div><dt>Phone</dt><dd>${esc(b.phone)}</dd></div><div><dt>Hours</dt><dd>${esc(b.hours)}</dd></div><div><dt>Registered office</dt><dd>${esc(b.name)}<br>${esc(b.address)}</dd></div><div><dt>GSTIN</dt><dd>${esc(b.gstin)}</dd></div></dl>
        </div></div>`,
      mount(el) {
        $("[data-contact-form]", el).addEventListener("submit", async (e) => {
          e.preventDefault();
          try {
            const c = await S.submitCase(Object.fromEntries(new FormData(e.target)));
            e.target.outerHTML = `<div class="result-hero">${'<span class="result-hero__icon">' + icon("check") + "</span>"}<h1>Message received</h1><p>Your reference is ${esc(c.id)}. Our team will reply to ${esc(c.email)}.</p></div>`;
          } catch (err) {
            $("[data-error]", e.target).textContent = err.message;
          }
        });
      },
    };
  }
  function viewPolicy([kind]) {
    const titles = { shipping: "Shipping & delivery", returns: "Returns & refunds", privacy: "Privacy policy", terms: "Terms of use" };
    const text = site().policies[kind] || "";
    const zones = kind === "shipping" ? `<h2>Current shipping fees</h2><table class="spec-table">${S.db.settings.shipping.zones.map((z) => `<tr><th>${esc(z.name)}</th><td>${money(z.fee)} · free over ${money(z.freeAbove)} · est. ${esc(z.eta)}</td></tr>`).join("")}</table>` : "";
    return {
      title: `${titles[kind]} — NIRAH`,
      html: `<div class="container" style="padding-bottom:96px"><header class="page-head">${crumbs([["Home", "#/"], [titles[kind], ""]])}<h1 class="page-title">${titles[kind]}</h1></header>
        <div class="prose">${text.split("\n\n").map((p) => `<p>${esc(p)}</p>`).join("")}${zones}</div></div>`,
    };
  }

  function view404(message = "We couldn't find that page.") {
    return { title: "Not found — NIRAH", html: `<div class="container">${emptyState("search", "Not found", esc(message), '<a class="btn btn--primary" href="#/shop">Browse the shop</a>')}</div>` };
  }

  // ---------- Sheets: cart, search, menu, quick view ----------
  const sheetRefreshers = new Set();

  function openCart(origin) {
    const sheet = openSheet({
      title: "Your cart",
      side: "right",
      origin,
      onClose: () => sheetRefreshers.delete(paint),
    });
    function paint() {
      const qt = S.quote();
      sheet.body.innerHTML = qt.lines.length
        ? `${issuesHtml(qt.issues)}${cartLines(qt, true)}
          <div class="sheet__foot">${totalsHtml(qt)}
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><a class="btn btn--ghost" href="#/cart" data-close>View cart</a><a class="btn btn--primary" href="#/checkout" data-close ${qt.issues.length ? 'style="pointer-events:none;opacity:.45"' : ""}>Checkout</a></div></div>`
        : emptyState("bag", "Your cart is empty", "Add something you love.", '<a class="btn btn--primary" href="#/shop" data-close>Shop all</a>');
      wireCartControls(sheet.body);
    }
    paint();
    sheetRefreshers.add(paint);
  }

  function openSearch(origin) {
    const sheet = openSheet({
      side: "top",
      origin,
      html: `<form class="search-box" role="search" data-search-form style="margin-top:20px">${icon("search")}<input name="q" autocomplete="off" placeholder="Search products, SKUs, brands, materials…" aria-label="Search" aria-controls="suggest" autofocus><button class="icon-btn-sm" type="button" data-close aria-label="Close search">${icon("close")}</button></form>
        <div class="suggest" id="suggest" role="listbox" aria-label="Suggestions"></div>`,
    });
    const input = $("input", sheet.el);
    const box = $("#suggest", sheet.el);
    let selected = -1;
    const mark = (text, term) => {
      const t = esc(text);
      const words = term.toLowerCase().match(/[a-z0-9]+/g) || [];
      return words.reduce((acc, w) => acc.replace(new RegExp(`(${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig"), "<mark>$1</mark>"), t);
    };
    const paint = () => {
      const term = input.value.trim();
      selected = -1;
      if (!term) {
        const cats = S.db.categories.filter((c) => !c.parentId && S.catVisible(c));
        box.innerHTML = `<div><h3>Browse</h3><div class="subcats" style="margin:0">${cats.map((c) => `<a class="chip" href="#/c/${c.slug}" data-close>${esc(c.name)}</a>`).join("")}</div></div>`;
        return;
      }
      const results = S.search(term).slice(0, 6);
      const cats = S.db.categories.filter((c) => S.catVisible(c) && c.name.toLowerCase().includes(term.toLowerCase())).slice(0, 4);
      box.innerHTML = `${cats.length ? `<div><h3>Categories</h3><div class="subcats" style="margin:0">${cats.map((c) => `<a class="chip" href="#/c/${c.slug}" data-close>${esc(c.name)}</a>`).join("")}</div></div>` : ""}
        ${results.length ? `<div><h3>Products</h3>${results
          .map(({ product: p, promoted }) => {
            const pr = S.pricing(p);
            const st = S.stockOf(p.sku);
            return `<a class="suggest__item" role="option" href="#/p/${p.slug}" data-close><img src="${imgUrl(p.images[0], 104)}" alt=""><span><strong>${mark(p.title, term)}</strong><small>${esc(catName(p.categoryId))} · ${stockText(st)}${promoted ? " · Featured" : ""}</small></span><span>${money(pr.price)}</span></a>`;
          })
          .join("")}<a class="link" href="#/search?q=${encodeURIComponent(term)}" data-close style="display:inline-block;margin-top:10px">See all results for “${esc(term)}”</a></div>`
          : `<p class="field__hint">No products match “${esc(term)}”. Try a simpler word, or browse a category.</p>`}`;
    };
    input.addEventListener("input", debounce(paint, 80));
    input.addEventListener("keydown", (e) => {
      const items = $$(".suggest__item", box);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        selected = Math.max(-1, Math.min(items.length - 1, selected + (e.key === "ArrowDown" ? 1 : -1)));
        items.forEach((it, i) => it.setAttribute("aria-selected", String(i === selected)));
        items[selected]?.scrollIntoView({ block: "nearest" });
      }
    });
    $("[data-search-form]", sheet.el).addEventListener("submit", (e) => {
      e.preventDefault();
      const items = $$(".suggest__item", box);
      if (selected >= 0 && items[selected]) location.hash = items[selected].getAttribute("href");
      else if (input.value.trim()) location.hash = `#/search?q=${encodeURIComponent(input.value.trim())}`;
      sheet.close();
    });
    paint();
  }

  function openMenu(origin) {
    const cats = S.db.categories.filter((c) => !c.parentId && S.catVisible(c)).sort((a, b) => a.order - b.order);
    const me = S.currentCustomer();
    openSheet({
      title: "Menu",
      side: "right",
      origin,
      html: `<nav class="menu-list" aria-label="More">
        <a href="#/shop" data-close>Shop All</a>
        <details><summary>Categories ${icon("down")}</summary>
          <div class="sub">${cats.map((c) => `<a href="#/c/${c.slug}" data-close>${esc(c.name)}</a>`).join("")}</div></details>
        <a href="#/new" data-close>New Arrivals</a><a href="#/best-sellers" data-close>Best Sellers</a><a href="#/offers" data-close>Offers</a>
        <a href="#/about" data-close>About NIRAH</a><a href="#/faq" data-close>FAQs</a><a href="#/contact" data-close>Contact</a>
        <a href="#/account" data-close>${icon("user")} ${me ? `My account (${esc(me.name.split(" ")[0])})` : "Sign in or create an account"}</a>
        <a href="#/track" data-close>${icon("truck")} Track an order</a>
      </nav>`,
    });
  }

  function openQuick(slug, origin) {
    const p = S.productBySlug(slug);
    if (!p) return;
    const pr = S.pricing(p);
    const st = S.stockOf(p.sku);
    const limit = Math.min(st.available, p.maxPerOrder);
    const rs = S.ratingSummary(p.id);
    openSheet({
      title: "",
      label: `Quick view: ${p.title}`,
      side: "center",
      wide: true,
      origin,
      html: `<div class="quick">
        <div class="quick__img"><img src="${imgUrl(p.images[0], 800)}" alt="${esc(p.images[0]?.alt)}"></div>
        <div class="quick__info" data-buy>
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px"><p class="product__cat">${esc(catName(p.categoryId))}</p><button class="icon-btn-sm" type="button" data-close aria-label="Close">${icon("close")}</button></div>
          <h2>${esc(p.title)}</h2>
          ${rs.count ? `<p class="product__rating">${stars(rs.avg)} ${rs.avg.toFixed(1)} <span>(${rs.count})</span></p>` : ""}
          <p class="price-block__now" style="font-size:26px">${money(pr.price)}${pr.saving ? ` <s>${money(pr.regular)}</s>` : ""}</p>
          <p>${stockHtml(st)}</p>
          <p class="field__hint">${esc(p.description)}</p>
          ${st.available > 0 ? `<div class="buy-row">${stepper(1, limit, 'name="qty"')}<button class="btn btn--primary" type="button" data-add="${p.sku}">${icon("bag")} Add to cart</button></div>` : `<p class="notice">${icon("info")} Out of stock. It can't be ordered until new stock is checked in.</p>`}
          <a class="link" href="#/p/${p.slug}" data-close>View full details and specifications</a>
        </div></div>`,
    });
  }

  // ---------- Global interactions ----------
  function addFeedback(btn) {
    if (!btn.classList.contains("product__add")) return;
    btn.classList.add("is-added");
    btn.innerHTML = icon("check");
    setTimeout(() => {
      btn.classList.remove("is-added");
      btn.innerHTML = icon("plus");
    }, 1400);
  }

  document.addEventListener("click", async (e) => {
    const t = e.target;
    const add = t.closest("[data-add]");
    if (add) {
      e.preventDefault();
      const scope = add.closest("[data-buy]");
      const qty = Number($('input[type="number"]', scope || document.createElement("div"))?.value) || 1;
      const res = S.cart.add(add.dataset.add, qty);
      if (res.ok) {
        addFeedback(add);
        if (M.enabled) M.flyToCart(add);
        toast(res.message, res.capped ? "info" : "ok");
        if ("vibrate" in navigator && navigator.userActivation?.isActive) navigator.vibrate(8);
      } else toast(res.message, "error");
      return;
    }
    const step = t.closest("[data-step]");
    if (step) {
      const box = step.closest("[data-stepper]");
      const input = $("input", box);
      const max = Number(input.max) || 99;
      const v = Math.min(max, Math.max(1, (Number(input.value) || 1) + Number(step.dataset.step)));
      input.value = v;
      $$("[data-step]", box).forEach((b) => (b.disabled = (b.dataset.step === "-1" && v <= 1) || (b.dataset.step === "1" && v >= max)));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
    const remove = t.closest("[data-cart-remove]");
    if (remove) {
      S.cart.remove(remove.dataset.cartRemove);
      toast("Removed from your cart.", "info");
      return;
    }
    const quick = t.closest("[data-quick]");
    if (quick) return openQuick(quick.dataset.quick, quick);
    if (t.closest("[data-open-cart]")) return openCart(t.closest("[data-open-cart]"));
    if (t.closest("[data-open-search]")) return openSearch(t.closest("[data-open-search]"));
    if (t.closest("[data-open-menu]")) return openMenu(t.closest("[data-open-menu]"));
    const scroll = t.closest("[data-scroll-to]");
    if (scroll) {
      e.preventDefault();
      const dest = document.getElementById(scroll.dataset.scrollTo);
      if (dest && M.enabled) M.scrollTo(dest);
      else dest?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      return;
    }
    const copy = t.closest("[data-copy]");
    if (copy) {
      navigator.clipboard?.writeText(copy.dataset.copy);
      toast(`Copied ${copy.dataset.copy}. Add it in your cart.`);
      return;
    }
    if (t.closest("[data-reset-demo]")) {
      if (await confirmDialog({ title: "Reset demo data?", body: "This clears orders, carts, accounts and admin changes in this browser and reloads the original demo data.", confirm: "Reset", danger: true })) S.reset();
    }
  });

  // A product's photo carries across into its page: name the tapped card's
  // image so the page transition morphs it into the gallery.
  document.addEventListener(
    "click",
    (e) => {
      const a = e.target.closest('a[href^="#/p/"]');
      if (!a || reduceMotion || !document.startViewTransition || !main.contains(a)) return;
      const img = a.closest(".product, .deck__card")?.querySelector("img");
      $$("[data-vt]").forEach((el) => {
        el.style.viewTransitionName = "";
        delete el.dataset.vt;
      });
      if (!img) return;
      img.style.viewTransitionName = "product-image";
      img.dataset.vt = "";
    },
    true
  );

  // "/" opens search from anywhere that isn't a text field.
  document.addEventListener("keydown", (e) => {
    if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || document.querySelector(".sheet")) return;
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable) return;
    e.preventDefault();
    openSearch($("[data-open-search]", headerEl));
  });

  document.addEventListener("change", (e) => {
    const input = e.target.closest("[data-cart-qty]");
    if (!input) return;
    const res = S.cart.set(input.dataset.cartQty, Number(input.value) || 1);
    if (res.capped || !res.ok) toast(res.message, res.ok ? "info" : "error");
  });

  document.addEventListener("submit", (e) => {
    const f = e.target.closest("[data-search-form]");
    if (f && main.contains(f)) {
      e.preventDefault();
      const term = f.q.value.trim();
      location.hash = term ? `#/search?q=${encodeURIComponent(term)}` : "#/search";
    }
  });

  window.addEventListener("hashchange", () => {
    if (location.hash.startsWith("#/")) render();
  });

  // ---------- Festive intro ----------
  // The banner index.html puts up before first paint holds for a beat once
  // its image can be seen, then lifts away; any tap, key or scroll skips
  // ahead. The first page's entrance starts while it lifts.
  const INTRO_HOLD = 2600;
  const introDone = (() => {
    const el = document.getElementById("intro");
    if (!el || el.hidden) return Promise.resolve();
    return new Promise((resolve) => {
      const img = $(".intro__img", el);
      const inputs = ["pointerdown", "keydown", "wheel", "touchmove"];
      let timer = 0;
      let gone = false;
      const leave = () => {
        if (gone) return;
        gone = true;
        clearTimeout(timer);
        inputs.forEach((t) => window.removeEventListener(t, skip));
        document.documentElement.classList.remove("is-intro");
        (M.enabled ? M.introOut(el) : cssIntroOut(el)).then(resolve);
      };
      const skip = (e) => {
        if (e.type === "keydown" && ["Shift", "Control", "Alt", "Meta"].includes(e.key)) return;
        leave();
      };
      inputs.forEach((t) => window.addEventListener(t, skip, { passive: true }));
      const start = () => {
        if (gone) return;
        el.classList.add("is-ready");
        if (M.enabled) M.introIn(el, INTRO_HOLD / 1000);
        timer = setTimeout(leave, INTRO_HOLD);
      };
      // Count the hold from when the banner can actually be seen: decoded,
      // and in a tab that is in front (one opened in the background waits).
      const visible = () =>
        document.visibilityState === "visible" ? Promise.resolve() : new Promise((r) => document.addEventListener("visibilitychange", r, { once: true }));
      Promise.race([img.decode ? img.decode() : Promise.resolve(), new Promise((r) => setTimeout(r, 1500))])
        .catch(() => {})
        .then(visible)
        .then(start);
    });
  })();

  // Without GSAP the lift is a CSS transition (see .intro in style.css).
  function cssIntroOut(el) {
    el.classList.add("is-leaving");
    setTimeout(() => el.remove(), 1000);
    return new Promise((r) => setTimeout(r, 300));
  }

  // ---------- Boot ----------
  S.ready.then(() => {
    renderHeader();
    renderFooter();
    if (M.enabled) M.chrome(headerEl);
    if (!location.hash) history.replaceState(null, "", "#/");
    render();
    S.subscribe((why) => {
      if (why === "data" || why === "external") renderFooter();
    });
  }).catch((err) => {
    main.innerHTML = `<div class="container">${emptyState("alert", "The demo couldn't start", esc(err.message))}</div>`;
  });

  void num;
})();
