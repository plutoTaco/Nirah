// Fluted-glass hero background.
// A soft colour field (assets/hero-field.png, a tiny blurred colour map) is
// stretched over the hero, then redrawn through a row of vertical "flutes":
// each flute shows a mirrored, squeezed slice of the field behind it, like
// ribbed glass, with a soft groove where two flutes meet.
(() => {
  const N = (window.Nirah = window.Nirah || {});
  const FLUTE_MIN = 21; // flute widths in 1440-artboard units
  const FLUTE_MAX = 26;
  const SQUEEZE = 1.6; // how much wider the slice seen through a flute is

  const source = new Image();
  source.src = "assets/hero-field.png";

  function random(seed) {
    return () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
  }

  // Paints the hero's canvas and keeps it in sync with the hero's size.
  // Returns a function that stops watching.
  N.fluted = function mount(hero) {
    const canvas = hero.querySelector(".hero__bg");
    if (!canvas) return () => {};
    const ctx = canvas.getContext("2d");
    const field = document.createElement("canvas");
    const fctx = field.getContext("2d");

    function render() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(hero.clientWidth * dpr);
      const h = Math.round(hero.clientHeight * dpr);
      if (!w || !h || !source.complete || !source.naturalWidth) return;

      canvas.width = w;
      canvas.height = h;
      field.width = w;
      field.height = h;
      fctx.imageSmoothingEnabled = true;
      fctx.imageSmoothingQuality = "high";
      fctx.drawImage(source, 0, 0, w, h);

      const unit = w / 1440;
      const next = random(11);
      let x = 0;
      while (x < w) {
        const fw = Math.min((FLUTE_MIN + next() * (FLUTE_MAX - FLUTE_MIN)) * unit, w - x);
        const sw = Math.min(fw * SQUEEZE, w);
        const sx = Math.max(0, Math.min(x + fw / 2 - sw / 2, w - sw));

        // Refracted, mirrored slice of the field.
        ctx.save();
        ctx.translate(x + fw, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(field, sx, 0, sw, h, 0, 0, fw, h);
        ctx.restore();

        // Groove on both edges, a faint highlight just inside the left edge.
        const shade = ctx.createLinearGradient(x, 0, x + fw, 0);
        shade.addColorStop(0, "rgba(25,62,35,0.07)");
        shade.addColorStop(0.1, "rgba(255,255,255,0.05)");
        shade.addColorStop(0.3, "rgba(255,255,255,0.02)");
        shade.addColorStop(0.7, "rgba(255,255,255,0)");
        shade.addColorStop(1, "rgba(25,62,35,0.11)");
        ctx.fillStyle = shade;
        ctx.fillRect(x, 0, fw, h);

        // Each pane of glass catches the light a little differently.
        const tint = next() * 2 - 1;
        ctx.fillStyle = tint > 0 ? `rgba(255,255,255,${tint * 0.04})` : `rgba(25,62,35,${-tint * 0.035})`;
        ctx.fillRect(x, 0, fw, h);

        // Occasional hairline inside a flute.
        if (next() < 0.45) {
          ctx.fillStyle = "rgba(25,62,35,0.05)";
          ctx.fillRect(x + fw * (0.35 + next() * 0.4), 0, 1.5 * unit, h);
        }
        x += fw;
      }
    }

    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(render);
    };
    source.addEventListener("load", schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(hero);
    return () => {
      observer.disconnect();
      source.removeEventListener("load", schedule);
      cancelAnimationFrame(frame);
    };
  };
})();
