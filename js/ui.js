// Shared helpers for the NIRAH storefront and admin portal: escaping and
// formatting, icons, springs, toasts, sheets and dialogs, file downloads.
(() => {
  const N = (window.Nirah = window.Nirah || {});
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ----- Text and numbers -----
  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

  const inr0 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
  const inr2 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 });
  const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const money = (n) => {
    const v = round2(n || 0);
    return Number.isInteger(v) ? inr0.format(v) : inr2.format(v);
  };
  const num = (n) => new Intl.NumberFormat("en-IN").format(n || 0);

  // All dates are shown and bucketed in India time so reports agree with each other.
  const TZ = "Asia/Kolkata";
  const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: TZ });
  const dateTimeFmt = new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: TZ,
  });
  const fmtDate = (t) => (t ? dateFmt.format(new Date(t)) : "—");
  const fmtDateTime = (t) => (t ? dateTimeFmt.format(new Date(t)) : "—");
  const dayKey = (t) => new Date(t).toLocaleDateString("en-CA", { timeZone: TZ });
  const toLocalInput = (t) => {
    if (!t) return "";
    const d = new Date(t);
    const pad = (x) => String(x).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const slugify = (s) =>
    String(s || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, "");

  const uid = (prefix) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

  const debounce = (fn, ms = 200) => {
    let t = 0;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  };

  // Unsplash images are resized through query parameters; any other URL is used as is.
  const imgUrl = (image, w, h) => {
    const src = typeof image === "string" ? image : image?.src;
    if (!src) return "";
    if (!src.includes("images.unsplash.com")) return src;
    let params = `?w=${w}&h=${h || w}&fit=crop&q=75&auto=format`;
    const z = typeof image === "object" && image.zoom;
    if (z) params += `&crop=focalpoint&fp-x=${z[0]}&fp-y=${z[1]}&fp-z=${z[2]}`;
    return src.split("?")[0] + params;
  };

  // ----- Icons (24px, stroked) -----
  const PATHS = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5"/>',
    bag: '<path d="M5 8h14l-1.2 12.2a1 1 0 0 1-1 .8H7.2a1 1 0 0 1-1-.8L5 8Z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
    menu: '<path d="M4 9h16M4 15h16"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    arrow: '<path d="M7 17 17 7M8 7h9v9"/>',
    left: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    right: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    up: '<path d="m6 15 6-6 6 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9Z"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
    truck: '<path d="M3 6h11v10H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
    shield: '<path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/>',
    box: '<path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5v-9Z"/><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9"/>',
    tag: '<path d="M3 12V4h8l9.5 9.5-8 8L3 12Z"/><circle cx="7.5" cy="8" r="1.4"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4"/>',
    pin: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.3"/>',
    filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
    trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
    edit: '<path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3Z"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    alert: '<path d="M12 3.5 2.5 20h19L12 3.5Z"/><path d="M12 10v4.5M12 17.5v.1"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5v.1"/>',
    download: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
    print: '<path d="M7 9V3.5h10V9M7 17H4.5V9.5h15V17H17"/><rect x="7" y="14" width="10" height="6.5" rx="1"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2.2"/>',
    home: '<path d="m3.5 11 8.5-7 8.5 7"/><path d="M6 9.5V20h12V9.5"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    layers: '<path d="m12 3.5 9 5-9 5-9-5 9-5Z"/><path d="m3 13.5 9 5 9-5"/>',
    cart: '<path d="M3.5 4.5h2.2l2 11h10.8l2-8H7"/><circle cx="9" cy="19.5" r="1.3"/><circle cx="17" cy="19.5" r="1.3"/>',
    card: '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3 10h18M7 15h3"/>',
    percent: '<path d="M19 5 5 19"/><circle cx="7" cy="7" r="2.3"/><circle cx="17" cy="17" r="2.3"/>',
    chat: '<path d="M7 3h10a4 4 0 0 1 4 4v6a4 4 0 0 1-4 4h-2.2L12 20.5 9.2 17H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4Z"/><path d="M8 8h8M8 11.5h5"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 19.5c.9-3.3 3.4-5 6.5-5s5.6 1.7 6.5 5"/><path d="M15.5 4.8a3.5 3.5 0 0 1 0 6.4M17.8 14.6c1.8.6 3.1 2.2 3.7 4.9"/>',
    page: '<path d="M6 3h8l4 4v14H6V3Z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
    chart: '<path d="M4 20V4M4 20h16"/><path d="M8 16v-5M12 16V8M16 16v-3"/>',
    settings:
      '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M4.2 7l2.6 1.5M17.2 15.5l2.6 1.5M4.2 17l2.6-1.5M17.2 8.5 19.8 7"/>',
    log: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.1M4 12h.1M4 18h.1"/>',
    wallet: '<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3.5"/><rect x="4" y="8" width="16.5" height="11" rx="2.5"/><circle cx="16.5" cy="13.5" r="1.2"/>',
    logout: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l4-4-4-4M14 12H4"/>',
    leaf: '<path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15"/><path d="M5 19 13 11"/>',
    spark: '<path d="M12 3v5M12 16v5M3 12h5M16 12h5"/>',
    pause: '<path d="M9 6.5v11M15 6.5v11"/>',
    play: '<path d="M8.5 6v12l9.5-6-9.5-6Z"/>',
    instagram: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17 7v.1"/>',
    facebook: '<path d="M14 8h3V4.5h-3a4 4 0 0 0-4 4V11H7.5v3.5H10V21h3.5v-6.5H16l.5-3.5h-3V8.8c0-.5.3-.8.5-.8Z"/>',
    youtube: '<rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="m10 9.5 5 2.5-5 2.5v-5Z"/>',
    pinterest: '<circle cx="12" cy="12" r="9"/><path d="M10.5 20.5 12 14m0 0c3.5 1 5.5-1.5 5-4.5S12 5 9 7.5 8 14 10 14.5"/>',
  };
  const icon = (name, cls = "") =>
    `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" aria-hidden="true">${PATHS[name] || ""}</svg>`;

  const logoMark = (cls = "") =>
    `<svg class="logo-mark ${cls}" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M7 11h18l-1.4 15.2a1.6 1.6 0 0 1-1.6 1.5H10a1.6 1.6 0 0 1-1.6-1.5L7 11Z" />
      <path d="M12 11V9a4 4 0 0 1 8 0v2" />
      <path d="M12.6 23.5v-8l6.8 8v-8" class="logo-mark__n" />
    </svg>`;

  const stars = (rating, cls = "") => {
    const full = Math.round(rating);
    let out = `<span class="stars ${cls}" role="img" aria-label="${rating.toFixed(1)} out of 5">`;
    for (let i = 1; i <= 5; i += 1) out += icon("star", i <= full ? "is-on" : "");
    return `${out}</span>`;
  };

  // ----- Springs (damping ratio + response, Apple's designer-friendly pair) -----
  // Critically damped by default; bounce only after a gesture carried momentum.
  const SPRING = {
    settle: { dampingRatio: 1, response: 0.4 },
    gentle: { dampingRatio: 1, response: 0.7 },
    sheet: { dampingRatio: 1, response: 0.42 },
    dismiss: { dampingRatio: 1, response: 0.32 },
    flick: { dampingRatio: 0.82, response: 0.4 },
  };

  // Progressive resistance past an edge, and where a flick would come to rest
  // (Apple's projection from Designing Fluid Interfaces).
  const rubberband = (overshoot, size, c = 0.55) => (overshoot * size * c) / (size + c * Math.abs(overshoot));
  const project = (velocity, rate = 0.998) => ((velocity / 1000) * rate) / (1 - rate);

  // Pointer velocity in px/s from the last 100ms of movement; zero if the
  // pointer rested before release, so a slow drop never throws.
  function velocityTracker() {
    let samples = [];
    return {
      reset(x, y, t) {
        samples = [{ x, y, t }];
      },
      add(x, y, t) {
        samples.push({ x, y, t });
        while (samples.length > 2 && t - samples[0].t > 100) samples.shift();
      },
      get(t) {
        const a = samples[0];
        const b = samples[samples.length - 1];
        const span = b ? b.t - a.t : 0;
        if (!span || t - b.t > 80) return { x: 0, y: 0 };
        return { x: ((b.x - a.x) / span) * 1000, y: ((b.y - a.y) / span) * 1000 };
      },
    };
  }

  const compact = window.matchMedia("(max-width: 47.9375em)");
  const forcesOf = ({ dampingRatio, response }) => ({
    stiffness: ((2 * Math.PI) / response) ** 2,
    damping: (4 * Math.PI * dampingRatio) / response,
  });
  const linearSupported = window.CSS?.supports?.("transition-timing-function", "linear(0, 1)");

  // Samples a spring into a CSS linear() easing, for CSS transitions and WAAPI.
  function springEasing(params, fallback = "cubic-bezier(0.25, 1, 0.5, 1)") {
    const { stiffness, damping } = forcesOf(params);
    const samples = [0];
    let x = 0;
    let v = 0;
    while (samples.length < 180 && !(Math.abs(1 - x) < 0.002 && Math.abs(v) < 0.02)) {
      for (let i = 0; i < 4; i += 1) {
        v += (-stiffness * (x - 1) - damping * v) / 240;
        x += v / 240;
      }
      samples.push(Math.round(x * 1e4) / 1e4);
    }
    samples[samples.length - 1] = 1;
    return {
      easing: linearSupported ? `linear(${samples.join(", ")})` : fallback,
      duration: Math.round(((samples.length - 1) / 60) * 1000),
    };
  }
  const EASE = {
    settle: springEasing(SPRING.settle),
    gentle: springEasing(SPRING.gentle, "cubic-bezier(0.2, 0.7, 0.2, 1)"),
    sheet: springEasing(SPRING.sheet),
  };
  const root = document.documentElement;
  root.style.setProperty("--ease-spring", EASE.settle.easing);
  root.style.setProperty("--spring-duration", `${EASE.settle.duration}ms`);
  root.style.setProperty("--ease-spring-gentle", EASE.gentle.easing);
  root.style.setProperty("--spring-duration-gentle", `${EASE.gentle.duration}ms`);
  // iOS Safari only applies :active press states once a touch listener exists.
  document.addEventListener("touchstart", () => {}, { passive: true });

  // One number driven by a spring. to() mid-flight only moves the target, so
  // position and velocity carry on and a reversal has no seam.
  function createSpring({ read, apply, onRest }) {
    let value = 0;
    let velocity = 0;
    let target = 0;
    let forces = forcesOf(SPRING.settle);
    let frame = 0;
    let last = 0;
    const tick = (now) => {
      let remaining = Math.min((now - last) / 1000, 1 / 20);
      last = now;
      while (remaining > 0) {
        const h = Math.min(remaining, 1 / 240);
        velocity += (-forces.stiffness * (value - target) - forces.damping * velocity) * h;
        value += velocity * h;
        remaining -= h;
      }
      if (Math.abs(value - target) < 0.3 && Math.abs(velocity) < 8) {
        frame = 0;
        velocity = 0;
        apply((value = target));
        onRest?.();
        return;
      }
      apply(value);
      frame = requestAnimationFrame(tick);
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };
    return {
      get active() {
        return frame !== 0;
      },
      get target() {
        return target;
      },
      stop,
      to(next, { velocity: initial, params = SPRING.settle } = {}) {
        if (!frame) {
          value = read();
          velocity = 0;
        }
        if (initial !== undefined) velocity = initial;
        target = next;
        forces = forcesOf(params);
        if (reduceMotion) {
          stop();
          apply((value = target));
          onRest?.();
          return;
        }
        if (!frame) {
          last = performance.now();
          frame = requestAnimationFrame(tick);
        }
      },
    };
  }

  // ----- Toast -----
  // A banner that drops from the top edge and leaves the way it came. A new
  // message while it is showing updates it in place instead of re-entering.
  let toastEl = null;
  let toastTimer = 0;
  function toast(message, kind = "ok") {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "toast";
      toastEl.setAttribute("role", "status");
      toastEl.setAttribute("aria-live", "polite");
      toastEl.innerHTML = '<span class="toast__icon"></span><span class="toast__text"></span>';
      document.body.append(toastEl);
    }
    const showing = toastEl.classList.contains("is-visible");
    toastEl.dataset.kind = kind;
    toastEl.querySelector(".toast__icon").innerHTML = icon(kind === "error" ? "alert" : kind === "info" ? "info" : "check");
    toastEl.querySelector(".toast__text").textContent = message;
    if (showing && !reduceMotion) toastEl.animate([{ scale: "1" }, { scale: "1.03" }, { scale: "1" }], { duration: 260, easing: "ease-out" });
    requestAnimationFrame(() => toastEl.classList.add("is-visible"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("is-visible"), kind === "error" ? 4200 : 2800);
  }

  // ----- Sheets and dialogs -----
  // Edge sheets are driven by a spring, so they enter and leave along the same
  // path, can be grabbed mid-flight, and on phones become bottom sheets you can
  // fling away. A centred dialog grows out of the control that opened it.
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

  function openSheet({ title = "", label = "", html = "", side = "right", origin = null, wide = false, className = "", onMount, onClose } = {}) {
    const opener = document.activeElement;
    const dialog = className.includes("sheet--dialog");
    const mode = side === "top" || dialog || !compact.matches ? side : "bottom";
    const wrap = document.createElement("div");
    wrap.className = `sheet sheet--${mode} ${wide ? "sheet--wide" : ""} ${className}`;
    wrap.innerHTML = `
      <div class="sheet__scrim" data-close></div>
      <section class="sheet__panel" role="dialog" aria-modal="true" aria-label="${esc(title || label || "Dialog")}">
        ${mode === "bottom" ? '<div class="sheet__grabber" aria-hidden="true"><span></span></div>' : ""}
        ${title ? `<header class="sheet__head"><h2 class="sheet__title">${esc(title)}</h2>
          <button class="icon-btn-sm" type="button" data-close aria-label="Close">${icon("close")}</button></header>` : ""}
        <div class="sheet__body">${html}</div>
      </section>`;
    document.body.append(wrap);
    document.body.classList.add("has-sheet");
    const panel = wrap.querySelector(".sheet__panel");
    const scrim = wrap.querySelector(".sheet__scrim");

    // Edge sheets: pos is the distance from fully open (0) toward closed.
    const axis = mode === "left" || mode === "right" ? "x" : "y";
    const sign = mode === "left" || mode === "top" ? -1 : 1;
    const extent = () => (axis === "x" ? panel.offsetWidth : panel.offsetHeight) + 32;
    let pos = 0;
    const paint = (v) => {
      pos = v;
      panel.style.transform = axis === "x" ? `translate3d(${sign * v}px,0,0)` : `translate3d(0,${sign * v}px,0)`;
      scrim.style.opacity = String(Math.min(1, Math.max(0, 1 - v / extent())));
    };
    let state = "open";
    let finish = () => {};
    const spring = createSpring({
      read: () => pos,
      apply: paint,
      onRest: () => state === "closing" && finish(),
    });

    const scaleFrames = () => {
      if (origin) {
        const r = origin.getBoundingClientRect();
        const p = panel.getBoundingClientRect();
        panel.style.transformOrigin = `${r.left + r.width / 2 - p.left}px ${r.top + r.height / 2 - p.top}px`;
      }
      return [
        { transform: "scale(0.86)", opacity: 0, filter: "blur(8px)" },
        { transform: "none", opacity: 1, filter: "blur(0)" },
      ];
    };
    const fade = (from, to, duration = 200) => {
      scrim.animate([{ opacity: from }, { opacity: to }], { duration, fill: "forwards" });
      return panel.animate([{ opacity: from }, { opacity: to }], { duration, fill: "forwards" }).finished.catch(() => {});
    };

    if (reduceMotion) fade(0, 1);
    else if (mode === "center") {
      panel.animate(scaleFrames(), { duration: EASE.settle.duration, easing: EASE.settle.easing });
      scrim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: "ease-out" });
    } else {
      paint(extent());
      spring.to(0, { params: SPRING.sheet });
    }

    const close = async (velocity = 0) => {
      if (state !== "open") return;
      state = "closing";
      document.removeEventListener("keydown", onKey);
      finish = () => {
        state = "closed";
        wrap.remove();
        if (!document.querySelector(".sheet")) document.body.classList.remove("has-sheet");
        onClose?.();
        if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
      };
      if (reduceMotion) {
        await fade(1, 0);
        finish();
      } else if (mode === "center") {
        scrim.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: "forwards" });
        await panel.animate(scaleFrames().reverse(), { duration: 200, easing: "cubic-bezier(0.3, 0, 0.8, 0.15)", fill: "forwards" }).finished.catch(() => {});
        finish();
      } else {
        spring.to(extent(), { velocity, params: SPRING.dismiss });
      }
    };

    // Bottom sheets follow the finger from the grabber or header, resist being
    // pulled up, and use the release velocity to decide: a flick down
    // dismisses even from a short drag, a slow drop springs back.
    if (mode === "bottom" && !reduceMotion) {
      const tracker = velocityTracker();
      let drag = null;
      panel.addEventListener("pointerdown", (e) => {
        if (e.button !== 0 || !e.target.closest(".sheet__grabber, .sheet__head") || e.target.closest("button, a, input")) return;
        if (state === "closing") {
          state = "open";
          document.addEventListener("keydown", onKey);
        }
        spring.stop();
        drag = { id: e.pointerId, y: e.clientY, start: pos, moved: false };
        tracker.reset(0, e.clientY, e.timeStamp);
        // Capture now: the grabber sits on the top edge, so the first move
        // upward already leaves the panel.
        panel.setPointerCapture(e.pointerId);
      });
      panel.addEventListener("pointermove", (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        if (!drag.moved) {
          if (Math.abs(e.clientY - drag.y) < 6) return;
          drag.moved = true;
          wrap.classList.add("is-dragging");
        }
        const raw = drag.start + (e.clientY - drag.y);
        paint(raw >= 0 ? raw : -rubberband(-raw, panel.offsetHeight));
        tracker.add(0, e.clientY, e.timeStamp);
      });
      const release = (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        const { moved } = drag;
        drag = null;
        wrap.classList.remove("is-dragging");
        if (!moved) return spring.to(0, { params: SPRING.settle });
        const v = tracker.get(e.timeStamp).y;
        if (pos + project(v) > panel.offsetHeight * 0.45) close(Math.max(v, 0));
        else spring.to(0, { velocity: v, params: Math.abs(v) > 300 ? SPRING.flick : SPRING.settle });
      };
      panel.addEventListener("pointerup", release);
      panel.addEventListener("pointercancel", release);
    }

    const onKey = (e) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab") {
        const items = [...panel.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    wrap.addEventListener("click", (e) => {
      if (e.target.closest("[data-close]")) close();
    });
    // Going back or following a link elsewhere takes the sheet with it.
    const onRoute = () => close();
    window.addEventListener("hashchange", onRoute, { once: true });
    const api = { el: wrap, panel, body: wrap.querySelector(".sheet__body"), close };
    onMount?.(api);
    const first = panel.querySelector("[autofocus]") || panel.querySelector(FOCUSABLE);
    first?.focus({ preventScroll: true });
    return api;
  }

  function confirmDialog({ title, body = "", confirm = "Confirm", danger = false, input = null } = {}) {
    return new Promise((resolve) => {
      let result = false;
      const sheet = openSheet({
        side: "center",
        className: "sheet--dialog",
        html: `<form class="dialog" data-dialog>
            <h2 class="dialog__title">${esc(title)}</h2>
            ${body ? `<p class="dialog__body">${body}</p>` : ""}
            ${input ? `<label class="field"><span class="field__label">${esc(input.label)}</span>
              ${input.type === "textarea" ? `<textarea name="value" rows="3" ${input.required ? "required" : ""}></textarea>` : `<input name="value" ${input.required ? "required" : ""} value="${esc(input.value || "")}">`}</label>` : ""}
            <div class="dialog__actions">
              <button class="btn btn--ghost" type="button" data-close>Cancel</button>
              <button class="btn ${danger ? "btn--danger" : "btn--primary"}" type="submit" autofocus>${esc(confirm)}</button>
            </div>
          </form>`,
        onClose: () => resolve(result),
      });
      sheet.el.querySelector("[data-dialog]").addEventListener("submit", (e) => {
        e.preventDefault();
        result = input ? new FormData(e.target).get("value") || "" : true;
        if (input && input.required && !String(result).trim()) return;
        sheet.close();
      });
    });
  }

  // ----- Files -----
  function download(filename, content, type = "text/plain") {
    const blob = new Blob([content], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const csvCell = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = (filename, header, rows) =>
    download(filename, [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n"), "text/csv");

  function printDocument(title, bodyHtml) {
    const w = window.open("", "_blank", "width=820,height=900");
    if (!w) return toast("Allow pop-ups to print or save this document.", "error");
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
      <style>
        body{font:14px/1.5 -apple-system,"Segoe UI",system-ui,sans-serif;color:#17211a;margin:40px;}
        h1{font:700 22px/1.2 -apple-system,"Segoe UI",system-ui,sans-serif;margin:0 0 4px} h2{font-size:15px;margin:24px 0 8px}
        table{width:100%;border-collapse:collapse;margin-top:8px} th,td{text-align:left;padding:8px 6px;border-bottom:1px solid #ddd;vertical-align:top}
        th{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#667063} .r{text-align:right}
        .muted{color:#667063} .grid{display:grid;grid-template-columns:1fr 1fr;gap:24px} .tot td{border:0;padding:4px 6px}
        .big{font-size:18px;font-weight:600} @media print{button{display:none}}
      </style></head><body>${bodyHtml}
      <p style="margin-top:32px"><button onclick="print()">Print / Save as PDF</button></p></body></html>`);
    w.document.close();
  }

  N.ui = {
    reduceMotion,
    esc,
    money,
    num,
    round2,
    fmtDate,
    fmtDateTime,
    dayKey,
    toLocalInput,
    slugify,
    uid,
    debounce,
    imgUrl,
    icon,
    logoMark,
    stars,
    SPRING,
    EASE,
    springEasing,
    createSpring,
    rubberband,
    project,
    velocityTracker,
    compact,
    toast,
    openSheet,
    confirmDialog,
    download,
    csv,
    printDocument,
  };
})();
