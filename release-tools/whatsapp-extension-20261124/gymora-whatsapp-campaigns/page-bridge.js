/*
 * Runs in WhatsApp Web's own page (MAIN world) next to wa-js (window.WPP). Sends a message
 * inside the open WhatsApp Web — no page reload — when content.js asks over window.postMessage.
 * Anything that fails before the send answers `unavailable`, so the side panel falls back to
 * opening the chat link instead.
 */
(() => {
  if (window.__waCampaignBridge) return;
  window.__waCampaignBridge = true;
  const FROM_EXT = 'wa-campaign-ext';
  const TO_EXT = 'wa-campaign-page';

  const ready = () => {
    try {
      return !!(window.WPP && window.WPP.isReady && window.WPP.conn.isAuthenticated());
    } catch {
      return false;
    }
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /** -1 error, 0 clock (WhatsApp outbox), 1+ reached WhatsApp's server. Gives up after ~20 s. */
  async function waitForAck(result) {
    let ack = typeof result.ack === 'number' ? result.ack : 0;
    for (let i = 0; i < 40 && ack === 0; i++) {
      await sleep(500);
      try {
        const msg = await window.WPP.chat.getMessageById(result.id);
        if (typeof msg?.ack === 'number') ack = msg.ack;
      } catch {
        /* keep the last known value */
      }
    }
    return ack;
  }

  async function send(phone, body) {
    let sending = false;
    try {
      if (!ready()) return { status: 'unavailable' };
      const exists = await window.WPP.contact.queryWidExists(`${phone}@c.us`);
      if (!exists || !exists.wid) return { status: 'failed', reason: 'not_on_whatsapp' };
      const to = exists.wid._serialized || String(exists.wid);
      // Show "typing…" for a moment (1–4 s) so the 10–20 s gap between messages stays about the same.
      const typingMs = Math.min(4000, 1000 + body.length * (8 + Math.random() * 8));
      try {
        await window.WPP.chat.markIsComposing(to, typingMs);
        await sleep(typingMs);
      } catch {
        /* the typing indicator is a nicety; send anyway */
      }
      sending = true;
      const result = await window.WPP.chat.sendTextMessage(to, body, { createChat: true });
      if (!result?.id) return { status: 'uncertain', reason: 'wpp: no message id' };
      // The message exists in WhatsApp's own store from here on: it is sent. Wait for the
      // server tick (ack ≥ 1) only to tell "delivered to WhatsApp" from "still in its outbox".
      const ack = await waitForAck(result);
      if (ack < 0) return { status: 'failed', reason: 'send_error' };
      return ack >= 1 ? { status: 'sent' } : { status: 'sent', reason: 'pending_ack' };
    } catch (err) {
      const why = String(err?.message || err).replace(/\s+/g, ' ').slice(0, 60);
      // After the send call started we cannot know whether it left; before it, nothing was sent.
      return sending ? { status: 'uncertain', reason: `wpp: ${why}` } : { status: 'unavailable', reason: why };
    }
  }

  const norm = (s) => String(s || '').replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase();

  /** Was this text sent by us to that number in the last few minutes? Reads WhatsApp's own store. */
  async function verify(phone, body, sinceMs) {
    if (!ready()) return null;
    try {
      const exists = await window.WPP.contact.queryWidExists(`${phone}@c.us`);
      const ids = [exists?.wid?._serialized, exists?.lid?._serialized, `${phone}@c.us`].filter(Boolean);
      const want = norm(body).slice(0, 40);
      for (const id of ids) {
        const messages = await window.WPP.chat.getMessages(id, { count: 15 }).catch(() => []);
        const mine = (messages || []).filter((m) => m?.id?.fromMe && norm(m.body).includes(want) && (!sinceMs || (m.t || 0) * 1000 >= sinceMs - 120000));
        if (mine.length) return { found: true, ack: typeof mine[mine.length - 1].ack === 'number' ? mine[mine.length - 1].ack : 0 };
      }
      return { found: false };
    } catch {
      return null;
    }
  }

  /**
   * Incoming text replies go to the side panel, which tells the gym system about «إيقاف» ones.
   * Only chats addressed by phone number (…@c.us) can be matched to a member.
   */
  let listening = false;
  function listenForReplies() {
    if (listening || !ready() || typeof window.WPP.on !== 'function') return;
    listening = true;
    window.WPP.on('chat.new_message', (msg) => {
      try {
        if (!msg || msg.id?.fromMe || msg.isGroupMsg || msg.type !== 'chat') return;
        const from = String(msg.from?._serialized || msg.from || '');
        const m = /^(\d{8,15})@c\.us$/.exec(from);
        const text = String(msg.body || '').slice(0, 200);
        if (m && text && text.length <= 60) window.postMessage({ source: TO_EXT, type: 'incoming', phone: m[1], text }, '*');
      } catch {
        /* never break WhatsApp's own handlers */
      }
    });
  }
  listenForReplies();
  const replyTimer = setInterval(() => { listenForReplies(); if (listening) clearInterval(replyTimer); }, 5000);

  window.addEventListener('message', async (event) => {
    if (event.source !== window || event.data?.source !== FROM_EXT) return;
    const { id, type } = event.data;
    const reply = (result) => window.postMessage({ source: TO_EXT, id, result }, '*');
    if (type === 'status') reply({ ready: ready() });
    else if (type === 'send') reply(await send(String(event.data.phone || ''), String(event.data.body || '')));
    else if (type === 'verify') reply(await verify(String(event.data.phone || ''), String(event.data.body || ''), Number(event.data.since) || 0));
  });
})();
