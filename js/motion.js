// NIRAH motion layer, built on GSAP: page entrances, scroll chapters and the
// small interactions (fly-to-cart, magnetic buttons, Flip re-ordering).
//
// Lifecycle mirrors a component framework: each routed view gets one
// gsap.matchMedia() scoped to <main>. Everything a view creates (tweens,
// ScrollTriggers, pins, SplitText) is recorded there and the router reverts
// it before the next view renders. Work that starts later, inside scroll
// callbacks or promises, is added through the handler's context so it is
// reverted too. If GSAP didn't load, `enabled` is false and the storefront
// falls back to its CSS reveal classes.
(() => {
  const N = (window.Nirah = window.Nirah || {});
  const { gsap, ScrollTrigger, SplitText, Flip, ScrollToPlugin, MotionPathPlugin, CustomEase } = window;
  if (!gsap || !ScrollTrigger) {
    N.motion = { enabled: false };
    return;
  }
  gsap.registerPlugin(...[ScrollTrigger, SplitText, Flip, ScrollToPlugin, MotionPathPlugin, CustomEase].filter(Boolean));
  document.documentElement.classList.add("has-gsap");
  ScrollTrigger.config({ ignoreMobileResize: true });

  // Brand motion identity (see design-dna.json): one signature curve for
  // most motion, three durations, a masked rise as the entrance pattern.
  if (CustomEase) CustomEase.create("nirah", "0.22, 1, 0.36, 1");
  const EASE = CustomEase ? "nirah" : "expo.out";
  const D = { quick: 0.2, base: 0.5, slow: 0.9, hero: 1.1 };
  gsap.defaults({ ease: EASE, duration: D.base });

  const MOTION_OK = "(prefers-reduced-motion: no-preference)";
  const reduced = () => !window.matchMedia(MOTION_OK).matches;
  // Ask for the display face explicitly: fonts.ready alone can resolve before
  // a freshly rendered heading has even started loading it.
  const fontsReady = () =>
    Promise.race([
      document.fonts ? Promise.all(['1em "Instrument Serif"', 'italic 1em "Instrument Serif"'].map((f) => document.fonts.load(f))).then(() => document.fonts.ready) : Promise.resolve(),
      new Promise((r) => setTimeout(r, 1500)),
    ]).catch(() => {});
  const $$ = (s, el) => [...el.querySelectorAll(s)];

  // Where an element sits relative to the viewport when a page mounts.
  // Anything already scrolled past is left alone, so it never stays hidden.
  const place = (el) => {
    const r = el.getBoundingClientRect();
    return r.top > innerHeight * 0.9 ? "below" : r.bottom > 0 ? "in" : "above";
  };

  // Split a heading into masked lines, rise them, then restore the original
  // markup so the heading wraps naturally again on resize.
  function riseLines(el, vars = {}) {
    gsap.set(el, { autoAlpha: 1 });
    if (!SplitText) return gsap.from(el, { y: 30, autoAlpha: 0, duration: D.slow, ...vars });
    const split = SplitText.create(el, { type: "lines", mask: "lines" });
    return gsap.from(split.lines, { yPercent: 115, duration: D.hero, stagger: 0.08, ...vars, onComplete: () => split.revert() });
  }

  // ---------- Global chrome: hide-on-scroll bar and progress hairline ----------
  function chrome(header) {
    const bar = header.querySelector("[data-progress]");
    const setProgress = bar ? gsap.quickSetter(bar, "scaleX") : () => {};
    ScrollTrigger.create({
      start: 0,
      end: "max",
      onUpdate(self) {
        setProgress(self.progress);
        const y = self.scroll();
        header.classList.toggle("is-scrolled", y > 8);
        const keep = reduced() || header.contains(document.activeElement) || document.body.classList.contains("has-sheet") || header.querySelector('[aria-expanded="true"]');
        header.classList.toggle("is-hidden", !keep && self.direction === 1 && y > 240);
      },
    });
  }

  // ---------- Page lifecycle ----------
  function page(root, { home = false, quiet = false, first = false, ready = Promise.resolve() } = {}) {
    const mm = gsap.matchMedia();
    const go = Promise.all([ready, fontsReady()]);
    mm.add({ motion: MOTION_OK, wide: "(min-width: 1024px)" }, (ctx) => {
      const { motion, wide } = ctx.conditions;
      if (!motion) return undefined;
      let alive = true;
      const later = (fn) => go.then(() => alive && ctx.add(fn));

      // Pin first, so every trigger created after it measures with its spacer.
      const pinned = wide && pinCategories(root);
      const stops = [];
      const bar = document.querySelector(".site-header__inner");
      if (first && bar) {
        gsap.set(bar, { autoAlpha: 0 });
        later(() => gsap.fromTo(bar, { yPercent: -100, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: D.slow, delay: 0.1 }));
      }
      if (home) {
        hero(root, later);
        stops.push(promo(root, { later }));
        marquee(root);
        manifesto(root);
      }
      parallax(root);
      if (!quiet) {
        heads(root, ctx, later);
        reveals(root, ctx, later);
        product(root, later);
      }
      ScrollTrigger.sort?.();
      return () => {
        alive = false;
        stops.forEach((stop) => stop?.());
        if (pinned) root.querySelector("[data-cats-pin]")?.classList.remove("is-pinned");
      };
    }, root);
    // With reduced motion the carousel still works by hand, cross-fading.
    if (home) mm.add("(prefers-reduced-motion: reduce)", () => promo(root, { still: true }), root);
    ScrollTrigger.refresh();
    return () => mm.revert();
  }

  // ---------- Festive intro ----------
  // While it holds, the banner settles from a slight zoom (ambient) and a
  // hairline counts down the wait (feedback). Then the whole sheet lifts off
  // the top like a page scrolling up, the art lagging a little behind its
  // frame for depth. app.js owns the timing and the skip inputs.
  let introHold = null;
  function introIn(el, hold) {
    const art = $$(".intro__img, .intro__fill", el);
    introHold = gsap.timeline().fromTo(el.querySelector(".intro__progress span"), { scaleX: 0 }, { scaleX: 1, duration: hold, ease: "none" }, 0);
    if (!reduced()) introHold.fromTo(art, { scale: 1.08 }, { scale: 1, duration: hold + 0.9, ease: "power1.out" }, 0);
  }

  // Resolves once the page beneath may begin its own entrance.
  function introOut(el) {
    introHold?.pause();
    return new Promise((resolve) => {
      if (reduced()) {
        gsap.to(el, { autoAlpha: 0, duration: 0.4, ease: "power1.out", onComplete: () => el.remove() });
        setTimeout(resolve, 150);
        return;
      }
      gsap
        .timeline({ defaults: { duration: 0.85, ease: "power3.inOut" }, onComplete: () => el.remove() })
        .to(el, { yPercent: -100 }, 0)
        .to($$(".intro__img, .intro__fill", el), { yPercent: 16 }, 0)
        .to(el.querySelector(".intro__skip"), { autoAlpha: 0, duration: 0.2, ease: "power1.out" }, 0)
        .call(resolve, null, 0.3);
    });
  }

  // ---------- Home: hero intro and parallax ----------
  function hero(root, later) {
    const el = root.querySelector("[data-hero]");
    if (!el) return;
    const title = el.querySelector(".hero__title");
    const copy = $$(".hero__kicker, .hero__text, .hero__cta", el);
    const frame = el.querySelector(".promo__viewport");
    const controls = el.querySelector(".promo__controls");
    const promises = $$(".hero__promises li", el);
    // Hide everything now (this frame), build the timeline once the page is
    // on screen and the display face has loaded, so lines split correctly.
    gsap.set([title, controls, ...copy, ...promises].filter(Boolean), { autoAlpha: 0 });
    if (frame) gsap.set(frame, { clipPath: "inset(100% 0% 0% 0%)" });
    later(() => {
      const tl = gsap.timeline({ defaults: { ease: EASE } });
      // The offers frame unveils upward, carrying on the intro's lift; the
      // headline rises a beat behind it.
      tl.addLabel("art", 0);
      if (frame)
        tl.to(frame, { clipPath: "inset(0% 0% 0% 0%)", duration: 1.2 }, "art")
          .from($$(".promo__slide.is-active img", frame), { scale: 1.15, duration: 1.6 }, "art")
          .fromTo(controls, { y: 12, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.6 }, "art+=0.75");
      tl.addLabel("type", 0.3)
        .add(riseLines(title, { duration: D.hero, stagger: 0.09 }), "type")
        .fromTo(copy, { y: 24, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.8, stagger: 0.08 }, "type+=0.3")
        .fromTo(promises, { y: 16, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.6, stagger: 0.06 }, "type+=0.6");
      $$("[data-count-to]", el).forEach((n) => tl.from(n, { textContent: 0, snap: { textContent: 1 }, duration: 1.4, ease: "power2.out" }, "type+=0.4"));
    });

    // Secondary layer: as the page scrolls on, the offers band lags a little
    // behind it (depth), never far enough to reach the copy beneath.
    if (frame) gsap.to(frame, { yPercent: 8, ease: "none", scrollTrigger: { trigger: el, start: "top top", end: "bottom top", scrub: 0.6 } });
  }

  // Hero offers carousel. Slides lie on top of each other; a change slides
  // the old one out and the new one in from the same side, each banner
  // travelling a little slower than its frame (on-screen motion, so inOut).
  // A fill inside the current dot times the hold. Autoplay waits while the
  // pointer or keyboard focus is on it, while it is off screen, and while
  // paused; drag or swipe, arrow keys, dots and arrows all move it. With
  // `still` (reduced motion) there is no autoplay and changes cross-fade.
  // Returns a cleanup for the page's matchMedia handler.
  function promo(root, { later = (fn) => fn(), still = false } = {}) {
    const el = root.querySelector("[data-promo]");
    if (!el) return undefined;
    const viewport = el.querySelector(".promo__viewport");
    const slides = $$("[data-promo-slide]", el);
    const dots = $$("[data-promo-go]", el);
    const fills = dots.map((d) => d.querySelector(".promo__dot-fill"));
    const toggle = el.querySelector("[data-promo-toggle]");
    const n = slides.length;
    const HOLD = 5;
    const ac = new AbortController();
    const on = (target, type, fn) => target?.addEventListener(type, fn, { signal: ac.signal });
    const holds = new Set();
    let index = 0;
    let paused = still;
    let change = null;
    let timer = null;

    const mark = () => {
      slides.forEach((s, k) => {
        s.classList.toggle("is-active", k === index);
        s.setAttribute("aria-hidden", String(k !== index));
        s.tabIndex = k === index ? 0 : -1;
      });
      dots.forEach((d, k) => d.setAttribute("aria-current", String(k === index)));
    };
    const sync = () => timer && (paused || holds.size ? timer.pause() : timer.resume());
    const restart = () => {
      timer?.kill();
      gsap.set(fills, { scaleX: (k) => (still && k === index ? 1 : 0) });
      if (still) return;
      timer = gsap.to(fills[index], { scaleX: 1, duration: HOLD, ease: "none", onComplete: () => go(index + 1, 1) });
      sync();
    };
    const hold = (why, held) => {
      if (held) holds.add(why);
      else holds.delete(why);
      sync();
    };

    function go(to, dir = to > index ? 1 : -1) {
      const next = gsap.utils.wrap(0, n, to);
      if (next === index) return;
      change?.progress(1);
      const from = slides[index];
      const into = slides[next];
      index = next;
      mark();
      const fromArt = $$("img", from);
      const intoArt = $$("img", into);
      change = still
        ? gsap.timeline().to(from, { autoAlpha: 0, duration: 0.3, ease: "power1.out" }, 0).to(into, { autoAlpha: 1, duration: 0.3, ease: "power1.out" }, 0)
        : gsap
            .timeline({ defaults: { duration: 1, ease: "power3.inOut" } })
            .set(into, { autoAlpha: 1, xPercent: 100 * dir, zIndex: 2 }, 0)
            .set(from, { zIndex: 1 }, 0)
            .to(from, { xPercent: -100 * dir }, 0)
            .to(fromArt, { xPercent: 35 * dir }, 0)
            .to(into, { xPercent: 0 }, 0)
            .fromTo(intoArt, { xPercent: -35 * dir }, { xPercent: 0 }, 0)
            .set(from, { autoAlpha: 0, xPercent: 0 })
            .set(fromArt, { xPercent: 0 });
      restart();
    }

    mark();
    gsap.set(slides, { autoAlpha: (k) => (k === index ? 1 : 0), xPercent: 0 });
    // The button outlives a re-run of this setup (e.g. crossing a breakpoint),
    // so its face is always drawn from the current state.
    const drawToggle = () => {
      if (!toggle) return;
      toggle.hidden = still;
      toggle.innerHTML = N.ui.icon(paused ? "play" : "pause");
      toggle.setAttribute("aria-label", paused ? "Play the offers" : "Pause the offers");
    };
    drawToggle();

    on(el.querySelector("[data-promo-prev]"), "click", () => go(index - 1, -1));
    on(el.querySelector("[data-promo-next]"), "click", () => go(index + 1, 1));
    dots.forEach((d, k) => on(d, "click", () => go(k)));
    on(toggle, "click", () => {
      paused = !paused;
      drawToggle();
      sync();
    });
    on(el, "keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      const dir = e.key === "ArrowRight" ? 1 : -1;
      go(index + dir, dir);
    });
    if (window.matchMedia("(hover: hover)").matches) {
      on(el, "pointerenter", () => hold("pointer", true));
      on(el, "pointerleave", () => hold("pointer", false));
    }
    on(el, "focusin", () => hold("focus", true));
    on(el, "focusout", (e) => !el.contains(e.relatedTarget) && hold("focus", false));

    // Drag or swipe: one change per gesture, judged on release. A drag must
    // not also follow the slide's link.
    let dragged = false;
    const swipe = ScrollTrigger.observe({
      target: viewport,
      type: "touch,pointer",
      dragMinimum: 8,
      onPress: () => (dragged = false),
      onDragStart: () => (dragged = true),
      onRelease: (self) => {
        const dx = self.x - self.startX;
        if (dragged && Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
      },
    });
    on(viewport, "click", (e) => {
      if (!dragged) return;
      e.preventDefault();
      dragged = false;
    });

    const seen = ScrollTrigger.create({ trigger: el, start: "top bottom", end: "bottom top", onToggle: (self) => hold("offscreen", !self.isActive) });
    // Start counting once the hero entrance has shown the first banner.
    later(() => gsap.delayedCall(0.9, restart));
    return () => {
      ac.abort();
      swipe.kill();
      seen.kill();
      timer?.kill();
      change?.kill();
    };
  }

  // Deals strip: a seamless loop whose speed follows scroll velocity and
  // eases back to its resting pace; it stops for pointer or keyboard focus.
  function marquee(root) {
    const strip = root.querySelector("[data-marquee]");
    const track = strip?.querySelector(".deals__track");
    if (!track) return;
    const loop = gsap.to(track, { xPercent: -50, ease: "none", duration: Number(strip.dataset.marquee) || 40, repeat: -1 });
    let surge;
    let held = false;
    ScrollTrigger.create({
      trigger: strip,
      start: "top bottom",
      end: "bottom top",
      onToggle: (self) => (self.isActive ? loop.resume() : loop.pause()),
      onUpdate(self) {
        if (held) return;
        const boost = gsap.utils.clamp(1, 6, 1 + Math.abs(self.getVelocity()) / 300);
        surge?.kill();
        surge = gsap.timeline().to(loop, { timeScale: boost, duration: 0.2, ease: "power1.out" }).to(loop, { timeScale: 1, duration: 1.2, ease: "power2.out" });
      },
    });
    const hold = (on) => {
      held = on;
      surge?.kill();
      surge = gsap.to(loop, { timeScale: on ? 0 : 1, duration: on ? 0.5 : 0.8, ease: "power2.out" });
    };
    strip.addEventListener("pointerenter", () => hold(true));
    strip.addEventListener("pointerleave", () => hold(false));
    strip.addEventListener("focusin", () => hold(true));
    strip.addEventListener("focusout", () => hold(false));
  }

  // Categories chapter: on wide screens the section pins and vertical scroll
  // carries the row sideways; each photo pans inside its frame as it passes.
  function pinCategories(root) {
    const section = root.querySelector("[data-cats-pin]");
    const track = section?.querySelector("[data-carousel-track]");
    if (!track) return;
    section.classList.add("is-pinned");
    const dist = () => Math.max(0, track.scrollWidth - document.documentElement.clientWidth);
    if (dist() < 40) {
      section.classList.remove("is-pinned");
      return;
    }
    const bar = section.querySelector("[data-carousel-bar]");
    const travel = gsap.to(track, {
      x: () => -dist(),
      ease: "none", // must stay linear so scroll and travel line up
      scrollTrigger: {
        trigger: section,
        start: "top top",
        end: () => `+=${dist()}`,
        pin: true,
        scrub: 0.8,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate: (self) => bar && gsap.set(bar, { scaleX: 0.08 + self.progress * 0.92 }),
      },
    });
    $$(".category-card", track).forEach((card) => {
      const img = card.querySelector("img");
      gsap.fromTo(img, { xPercent: -7 }, { xPercent: 7, ease: "none", scrollTrigger: { trigger: card, containerAnimation: travel, start: "left right", end: "right left", scrub: true } });
    });
    return travel;
  }

  // Manifesto: words fill from faint to full ink as the paragraph is read.
  function manifesto(root) {
    const el = root.querySelector("[data-manifesto]");
    if (!el || !SplitText) return;
    const split = SplitText.create(el, { type: "words" });
    gsap.fromTo(split.words, { opacity: 0.16 }, { opacity: 1, ease: "none", stagger: 0.1, scrollTrigger: { trigger: el.parentElement, start: "top 72%", end: "bottom 75%", scrub: true } });
  }

  // Any photo marked data-parallax pans within its frame while in view.
  function parallax(root) {
    $$("[data-parallax]", root).forEach((img) => {
      gsap.fromTo(img, { yPercent: -7 }, { yPercent: 7, ease: "none", scrollTrigger: { trigger: img.parentElement, start: "top bottom", end: "bottom top", scrub: true } });
    });
  }

  // ---------- Entrances ----------
  // Section heads: the rule draws in, the index and title rise, the aside follows.
  function heads(root, ctx, later) {
    $$(".section-head", root).forEach((head) => {
      const where = place(head);
      if (where === "above") return;
      const title = head.querySelector(".section-title");
      const rule = head.querySelector(".section-head__rule");
      const bits = $$(".overline, .section-head__aside", head);
      gsap.set(title, { autoAlpha: 0 });
      gsap.set(rule, { scaleX: 0, transformOrigin: "0 50%" });
      gsap.set(bits, { autoAlpha: 0, y: 14 });
      const play = () =>
        gsap
          .timeline()
          .to(rule, { scaleX: 1, duration: 1.2 }, 0)
          .to(bits, { autoAlpha: 1, y: 0, duration: 0.7, stagger: 0.08 }, 0.15)
          .add(riseLines(title), 0.1);
      if (where === "in") later(play);
      else ScrollTrigger.create({ trigger: head, start: "top 88%", once: true, onEnter: () => ctx.add(play) });
    });
    // Page titles on listing, content and checkout pages.
    $$(".page-title, .pdp__title, .offer-banner__title, .cat-banner .page-title", root).forEach((title) => {
      const where = place(title);
      if (where === "above") return;
      gsap.set(title, { autoAlpha: 0 });
      if (where === "in") later(() => riseLines(title, { delay: 0.05 }));
      else ScrollTrigger.create({ trigger: title, start: "top 88%", once: true, onEnter: () => ctx.add(() => riseLines(title)) });
    });
  }

  // Cards, quotes and blocks: masked media and a short rise, batched so
  // items entering together cascade (40–60ms apart, under half a second).
  function reveals(root, ctx, later) {
    const targets = $$("[data-reveal]:not(.section-head), [data-reveal-group] > *", root);
    const now = [];
    const below = [];
    targets.forEach((el) => {
      const where = place(el);
      if (where === "in") now.push(el);
      else if (where === "below") below.push(el);
    });
    const show = (els) => gsap.to(els, { autoAlpha: 1, y: 0, duration: 0.8, stagger: 0.06, overwrite: true });
    if (now.length || below.length) gsap.set([...now, ...below], { autoAlpha: 0, y: 30 });
    if (now.length) later(() => show(now));
    if (below.length)
      ScrollTrigger.batch(below, {
        start: "top 92%",
        interval: 0.1,
        batchMax: 6,
        onEnter: (batch, triggers) => {
          ctx.add(() => show(batch));
          triggers.forEach((t) => t.kill());
        },
      });

    // Framed photos unveil upward and settle from a slight zoom.
    $$("[data-clip]", root).forEach((frame) => {
      const where = place(frame);
      if (where === "above") return;
      const img = frame.querySelector("img");
      gsap.set(frame, { clipPath: "inset(100% 0% 0% 0%)" });
      const play = () =>
        gsap
          .timeline()
          .to(frame, { clipPath: "inset(0% 0% 0% 0%)", duration: 1.2 }, 0)
          .from(img, { scale: 1.12, duration: 1.6 }, 0);
      if (where === "in") later(play);
      else ScrollTrigger.create({ trigger: frame, start: "top 85%", once: true, onEnter: () => ctx.add(play) });
    });

    // Numbered rules in lists draw from the left.
    $$("[data-rule]", root).forEach((rule) => {
      gsap.fromTo(rule, { scaleX: 0 }, { scaleX: 1, duration: 1.2, transformOrigin: "0 50%", scrollTrigger: { trigger: rule, start: "top 90%", once: true } });
    });
  }

  // Product page: the photo arrives by the card-to-page image morph (a view
  // transition), so only the buying column cascades in beside it.
  function product(root, later) {
    const info = $$(".pdp__info > *:not(:first-child)", root);
    if (!info.length) return;
    gsap.set(info, { autoAlpha: 0, y: 20 });
    later(() => gsap.to(info, { autoAlpha: 1, y: 0, duration: 0.7, stagger: 0.05, delay: 0.1 }));
  }

  // ---------- Interactions ----------
  // Popular-grid filters: products that stay glide to their new rank;
  // newcomers rise in. Returns false when it didn't animate.
  function swap(host, mutate) {
    if (!Flip || reduced()) {
      mutate();
      return false;
    }
    const state = Flip.getState($$("[data-flip-id]", host));
    mutate();
    Flip.from(state, {
      targets: $$("[data-flip-id]", host),
      duration: 0.7,
      ease: EASE,
      stagger: 0.03,
      onEnter: (els) => gsap.fromTo(els, { autoAlpha: 0, y: 24, scale: 0.96 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.6, stagger: 0.04, ease: EASE }),
      // The grid may have changed height; later sections' triggers re-measure.
      onComplete: () => ScrollTrigger.refresh(),
    });
    return true;
  }

  // Add to cart: the product photo arcs into the cart, which nods on arrival.
  function flyToCart(button) {
    if (reduced() || !MotionPathPlugin) return;
    const src =
      button.closest(".product")?.querySelector(".product__media img") ||
      button.closest(".quick")?.querySelector(".quick__img img") ||
      (button.closest(".pdp") && document.querySelector("[data-gallery-main]"));
    const header = document.querySelector(".site-header");
    header?.classList.remove("is-hidden");
    const target = [document.querySelector(".hbtn--cart"), document.querySelector('.tabbar [data-tab="/cart"]')].find((el) => el && el.getClientRects().length && getComputedStyle(el).display !== "none");
    const glyph = target?.querySelector("svg");
    if (!src || !glyph) return;
    const a = src.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    // The bar may still be sliding back in; aim for where it will rest.
    const lift = header?.contains(target) ? header.getBoundingClientRect().top : 0;
    const size = Math.min(a.width, a.height, 140);
    const ghost = document.createElement("div");
    ghost.className = "cart-ghost";
    ghost.style.cssText = `width:${size}px;height:${size}px;background-image:url("${src.currentSrc || src.src}")`;
    document.body.append(ghost);
    const start = { x: a.left + a.width / 2 - size / 2, y: a.top + a.height / 2 - size / 2 };
    const end = { x: b.left + b.width / 2 - size / 2, y: b.top - lift + b.height / 2 - size / 2 };
    // Arc above the higher end, but never off the top of the screen.
    const peak = { x: (start.x + end.x) / 2, y: Math.max(12, Math.min(start.y, end.y) - Math.min(140, innerHeight * 0.18)) };
    gsap.set(ghost, { x: start.x, y: start.y });
    gsap
      .timeline({ onComplete: () => ghost.remove() })
      .to(ghost, { motionPath: { path: [start, peak, end], curviness: 1 }, duration: 0.85, ease: "power2.inOut" }, 0)
      .to(ghost, { scale: 0.16, borderRadius: "50%", duration: 0.85, ease: "power2.in" }, 0)
      .to(ghost, { autoAlpha: 0, duration: 0.15 }, 0.72)
      .fromTo(glyph, { scale: 1 }, { scale: 1.22, duration: 0.14, ease: "power2.out", yoyo: true, repeat: 1, immediateRender: false }, 0.76);
  }

  // Primary actions lean toward a fine pointer. The offset drives CSS
  // custom properties feeding `translate`, so it never fights the press
  // scale that lives on `transform`.
  function magnetic() {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const pulls = new WeakMap();
    document.addEventListener(
      "pointermove",
      (e) => {
        if (!fine.matches || reduced()) return;
        const el = e.target.closest?.("[data-magnetic]");
        if (!el) return;
        let pull = pulls.get(el);
        if (!pull) {
          pull = { x: gsap.quickTo(el, "--mx", { duration: 0.5, ease: "power3.out" }), y: gsap.quickTo(el, "--my", { duration: 0.5, ease: "power3.out" }) };
          pulls.set(el, pull);
          el.addEventListener("pointerleave", () => {
            pull.x(0);
            pull.y(0);
          });
        }
        const r = el.getBoundingClientRect();
        const mx = parseFloat(gsap.getProperty(el, "--mx")) || 0;
        const my = parseFloat(gsap.getProperty(el, "--my")) || 0;
        pull.x((e.clientX - (r.left - mx + r.width / 2)) * 0.3);
        pull.y((e.clientY - (r.top - my + r.height / 2)) * 0.3);
      },
      { passive: true }
    );
  }

  function scrollTo(el) {
    const header = document.querySelector(".site-header");
    const offset = el.matches("[data-cats-pin]") ? 0 : (header?.offsetHeight || 64) + 16;
    if (!ScrollToPlugin) return el.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" });
    const distance = Math.abs(el.getBoundingClientRect().top);
    gsap.to(window, { duration: reduced() ? 0 : gsap.utils.clamp(0.6, 1.4, distance / 1500), ease: "power3.inOut", scrollTo: { y: el, offsetY: offset, autoKill: true } });
  }

  // Footer wordmark: letters rise out of the baseline as the page ends.
  let footerMM = null;
  function footer(el) {
    footerMM?.revert();
    footerMM = gsap.matchMedia();
    footerMM.add(MOTION_OK, () => {
      const mark = el.querySelector(".footer-mark");
      if (!mark || !SplitText) return;
      const split = SplitText.create(mark, { type: "chars" });
      gsap.from(split.chars, { yPercent: 105, duration: 1.1, stagger: 0.06, scrollTrigger: { trigger: mark, start: "top 98%", toggleActions: "play none none reverse" } });
    });
  }

  magnetic();
  N.motion = { enabled: true, EASE, D, chrome, page, introIn, introOut, swap, flyToCart, scrollTo, footer, refresh: () => ScrollTrigger.refresh() };
})();
