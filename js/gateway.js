// NIRAH Pay sandbox: a stand-in for the hosted payment gateway. It keeps its
// own records, never sees card numbers, and tells the store about outcomes
// only through signed webhooks, which can arrive late or more than once.
(() => {
  const N = window.Nirah;
  const KEY = "nirah:gateway";
  // Shared with the store's settings.gateway.webhookSecret, as with a real provider.
  const SECRET = "whsec_sbx_4f9a1c7e2b";
  const rand = () => Math.random().toString(36).slice(2, 12);

  const load = () => {
    try {
      return { sessions: [], outbox: [], ...JSON.parse(localStorage.getItem(KEY)) };
    } catch {
      return { sessions: [], outbox: [] };
    }
  };
  const save = (g) => localStorage.setItem(KEY, JSON.stringify(g));
  const locked = (fn) => (navigator.locks ? navigator.locks.request("nirah-gateway", fn) : fn());

  // Same idempotency key → same session, so a double click never opens two.
  async function createSession({ merchantRef, paymentId, amount, idempotencyKey, methods }) {
    return locked(() => {
      const g = load();
      const existing = g.sessions.find((s) => s.idempotencyKey === idempotencyKey);
      if (existing) return existing;
      const s = { id: `ps_${rand()}`, merchantRef, paymentId, amount, idempotencyKey, methods, state: "open", createdAt: Date.now() };
      g.sessions.push(s);
      save(g);
      return s;
    });
  }

  const session = (id) => load().sessions.find((s) => s.id === id) || null;

  async function queue(g, type, s, extra, delay) {
    const event = { id: `evt_${rand()}`, type, created: Date.now(), data: { sessionId: s.id, merchantRef: s.merchantRef, amount: s.amount, ...extra } };
    const body = JSON.stringify(event);
    g.outbox.push({ eventId: event.id, type, body, signature: await N.store.hmac(SECRET, body), deliverAt: Date.now() + delay, delivered: false, attempts: 0 });
  }

  // outcome: "success" | "failure" | "pending" (bank confirms later)
  async function complete(sessionId, outcome, method) {
    const g = load();
    const s = g.sessions.find((x) => x.id === sessionId);
    if (!s) throw new Error("Payment session not found.");
    if (s.state !== "open") return s;
    const txnId = `sbx_txn_${rand()}`;
    s.method = method;
    if (outcome === "failure") {
      s.state = "failed";
      await queue(g, "payment.failed", s, { method, reason: "Declined by issuing bank (sandbox)" }, 900);
    } else {
      s.state = outcome === "pending" ? "processing" : "captured";
      s.txnId = txnId;
      // A real gateway can notify late; "pending" simulates a slow bank confirmation.
      await queue(g, "payment.captured", s, { method, txnId }, outcome === "pending" ? 12000 : 1400);
    }
    save(g);
    setTimeout(deliverDue, outcome === "pending" ? 12100 : 1500);
    return s;
  }

  // The customer closed the page: nothing is sent; the store's hold expires.
  function abandon(sessionId) {
    const g = load();
    const s = g.sessions.find((x) => x.id === sessionId);
    if (s && s.state === "open") s.state = "abandoned";
    save(g);
  }

  let delivering = false;
  async function deliverDue() {
    if (delivering || !N.store?.db) return;
    delivering = true;
    try {
      await locked(async () => {
        const g = load();
        const due = g.outbox.filter((m) => !m.delivered && m.deliverAt <= Date.now());
        for (const m of due) {
          m.attempts += 1;
          try {
            await N.store.handleWebhook(m.body, m.signature);
            m.delivered = true;
            m.deliveredAt = Date.now();
          } catch (err) {
            m.lastError = String(err.message || err);
            m.deliverAt = Date.now() + 5000;
          }
        }
        if (due.length) save(g);
      });
    } finally {
      delivering = false;
    }
  }

  // Sends an already-delivered event again (gateways retry), to prove the
  // store ignores duplicates.
  async function redeliver(eventId) {
    const m = load().outbox.find((x) => x.eventId === eventId);
    if (!m) throw new Error("That event was not sent by the sandbox gateway in this browser.");
    return N.store.handleWebhook(m.body, m.signature);
  }

  N.gateway = { createSession, session, complete, abandon, deliverDue, redeliver, events: () => load().outbox };
  N.store?.ready.then(() => {
    deliverDue();
    setInterval(deliverDue, 2000);
  });
})();
