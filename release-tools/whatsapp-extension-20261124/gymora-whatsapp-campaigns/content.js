/*
 * Runs inside web.whatsapp.com. The side panel opens /send?phone=…&text=… (WhatsApp itself
 * fills the composer), then asks this script to press Send and confirm the message left.
 * Every DOM selector comes from the server so a WhatsApp UI change is fixed without a release.
 */
(() => {
  if (window.__pharosWaContent) return;
  window.__pharosWaContent = true;

  const FALLBACK_SELECTORS = {
    composer: 'footer div[contenteditable="true"]',
    sendButton: 'footer button[aria-label="Send"], footer button[aria-label="إرسال"], footer [data-icon="send"], footer [data-icon="wds-ic-send-filled"]',
    dialog: 'div[role="dialog"], [data-animate-modal-popup="true"]',
    dialogOk: 'div[role="dialog"] button, [data-animate-modal-popup="true"] button',
    outgoing: '#main div.message-out',
    pendingIcon: '[data-icon="msg-time"]',
    sentIcon: '[data-icon="msg-check"], [data-icon="msg-dblcheck"], [data-icon="msg-dblcheck-ack"]',
    qrCode: 'canvas[aria-label*="QR" i], div[data-ref] canvas',
    appReady: '#side, #pane-side',
  };

  const INVALID_NUMBER = /invalid|غير صالح|غير صحيح|no es válido|isn.t on whatsapp|ليس على واتساب|غير مسجل/i;
  const STARTING_CHAT = /starting chat|loading|جارٍ|جاري|بدء الدردشة|بدء المحادثة/i;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // Letters and digits only: WhatsApp renders emoji as <img> (absent from innerText) and may
  // reflow spaces/marks, so comparing anything else would miss our own message.
  const norm = (s) => (s || '').replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase();
  const visible = (el) => !!el && el.getClientRects().length > 0;

  async function waitFor(check, timeoutMs, stepMs = 300) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      const value = check();
      if (value) return value;
      await sleep(stepMs);
    }
    return null;
  }

  function q(sel, root = document) {
    try { return root.querySelector(sel); } catch { return null; }
  }
  function qa(sel, root = document) {
    try { return [...root.querySelectorAll(sel)]; } catch { return []; }
  }

  // Own messages carry data-id="true_<chat>_<id>" in WhatsApp Web; the class-based selector
  // from the server is the fallback.
  function lastOutgoing(S) {
    const byId = qa('#main [data-id^="true_"]');
    const all = byId.length ? byId : qa(S.outgoing);
    return all[all.length - 1] || null;
  }

  function clickable(el) {
    return el?.closest('button, [role="button"]') || el;
  }

  /** Composer text WhatsApp prefilled from ?text=…, or our own fallback insert. */
  async function ensureComposerText(S, body) {
    const composer = q(S.composer);
    if (!composer) return false;
    const want = norm(body).slice(0, 25);
    if (norm(composer.innerText).includes(want)) return true;
    // Prefill sometimes lands a moment after the chat opens.
    if (await waitFor(() => norm(q(S.composer)?.innerText).includes(want), 4000)) return true;
    composer.focus();
    document.execCommand('selectAll', false);
    document.execCommand('insertText', false, body);
    return !!(await waitFor(() => norm(q(S.composer)?.innerText).includes(want), 3000));
  }

  async function send({ body, selectors }) {
    const S = { ...FALLBACK_SELECTORS, ...(selectors || {}) };

    // 1. Wait for the chat, an "invalid number" popup, or the login QR. WhatsApp shows a
    //    transient "Starting chat…" popup first (sometimes with a Cancel button): a popup only
    //    counts once it has stayed for 12 s without turning into the chat.
    let dialogSince = 0;
    const opened = await waitFor(() => {
      if (visible(q(S.qrCode))) return 'logged_out';
      const composer = q(S.composer);
      if (composer && visible(composer)) return 'chat';
      const dialog = q(S.dialog);
      if (dialog && visible(dialog)) {
        const text = dialog.innerText || '';
        if (INVALID_NUMBER.test(text)) return 'invalid';
        if (!dialogSince) dialogSince = Date.now();
        if (Date.now() - dialogSince > 12000 && !STARTING_CHAT.test(text)) return 'dialog';
      } else {
        dialogSince = 0;
      }
      return null;
    }, 45000);

    if (!opened) return { status: 'failed', reason: 'compose_timeout' };
    if (opened === 'logged_out') return { status: 'failed', reason: 'logged_out', stop: true };
    if (opened === 'invalid') {
      clickable(q(S.dialogOk))?.click();
      return { status: 'failed', reason: 'not_on_whatsapp' };
    }
    if (opened === 'dialog') {
      // Unknown popup: leave it alone (the next message reloads the page) and report its text.
      const text = (q(S.dialog)?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 70);
      return { status: 'failed', reason: `dialog: ${text || 'empty'}` };
    }

    // 2. Make sure our text is in the box — never send someone else's draft.
    if (!(await ensureComposerText(S, body))) return { status: 'failed', reason: 'compose_failed' };
    await sleep(400 + Math.random() * 600);

    // 3. Send.
    const before = lastOutgoing(S);
    const button = q(S.sendButton);
    if (button) clickable(button).click();
    else {
      const composer = q(S.composer);
      composer?.focus();
      composer?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    }

    // 4. Confirm: a new outgoing bubble carrying our text, then its clock icon turns into a tick.
    const want = norm(body).slice(0, 25);
    const bubble = await waitFor(() => {
      const last = lastOutgoing(S);
      return last && last !== before && norm(last.innerText).includes(want) ? last : null;
    }, 20000);
    if (!bubble) {
      const leftover = norm(q(S.composer)?.innerText);
      // Text still in the box → nothing left. Box empty but no bubble → can't tell.
      return leftover.includes(want) ? { status: 'failed', reason: 'send_button_failed' } : { status: 'uncertain', reason: 'send_timeout' };
    }
    const ticked = await waitFor(() => (q(S.sentIcon, bubble) && !q(S.pendingIcon, bubble) ? true : null), 30000, 500);
    // A clock that never turns is still queued in WhatsApp's own outbox and will go out.
    return ticked ? { status: 'sent' } : { status: 'sent', reason: 'pending_ack' };
  }

  // Talk to page-bridge.js (WhatsApp's own page, next to wa-js) over window.postMessage.
  let bridgeSeq = 0;
  function askPage(payload, timeoutMs) {
    return new Promise((resolve) => {
      const id = `${Date.now()}-${++bridgeSeq}`;
      const done = (result) => { window.removeEventListener('message', onMessage); clearTimeout(timer); resolve(result); };
      const onMessage = (event) => {
        if (event.source === window && event.data?.source === 'wa-campaign-page' && event.data.id === id) done(event.data.result);
      };
      const timer = setTimeout(() => done(null), timeoutMs);
      window.addEventListener('message', onMessage);
      window.postMessage({ source: 'wa-campaign-ext', id, ...payload }, '*');
    });
  }

  // page-bridge.js saw an incoming reply: hand it to the side panel (it decides whether it is «إيقاف»).
  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.source !== 'wa-campaign-page' || event.data.type !== 'incoming') return;
    try {
      chrome.runtime.sendMessage({ type: 'incoming-reply', phone: String(event.data.phone || ''), text: String(event.data.text || '') }).catch(() => {});
    } catch {
      /* extension reloaded */
    }
  });

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg?.type === 'ping') {
      const ready = !!q(FALLBACK_SELECTORS.appReady) || !!q(msg.selectors?.appReady || '#side');
      askPage({ type: 'status' }, 1500).then((status) => reply({ ok: true, ready, inpage: !!status?.ready }));
      return true;
    }
    if (msg?.type === 'verify-inpage') {
      askPage({ type: 'verify', phone: msg.phone, body: msg.body, since: msg.since }, 20000).then((result) => reply(result));
      return true;
    }
    if (msg?.type === 'send-inpage') {
      // A send that started but never answered must not be retried blindly.
      askPage({ type: 'send', phone: msg.phone, body: msg.body }, 90000)
        .then((result) => reply(result || { status: 'uncertain', reason: 'send_timeout' }));
      return true;
    }
    if (msg?.type === 'send') {
      send(msg).then(reply, (err) => reply({ status: 'uncertain', reason: `script_error:${String(err?.message || err).slice(0, 40)}` }));
      return true; // async reply
    }
    return false;
  });
})();
