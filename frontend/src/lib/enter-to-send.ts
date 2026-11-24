/**
 * Whether pressing Enter should send rather than insert a newline.
 *
 * Enter-to-send needs Shift+Enter as the escape hatch for a line break — and a touch
 * keyboard has no Shift. On a phone the return key is the only way to start a new line, so
 * binding it to send made every multi-line comment impossible to write: the first line break
 * posted the comment. Touch devices type into the box and use the send button instead.
 */
export function entersSend(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  // `pointer: coarse` is the touch-primary case — phones and tablets.
  return !window.matchMedia('(pointer: coarse)').matches;
}

/** True when this key press should submit: Enter, no Shift, and not on a touch keyboard. */
export function shouldSendOnKey(
  event: { key: string; shiftKey: boolean },
  enterSends = entersSend(),
): boolean {
  return enterSends && event.key === 'Enter' && !event.shiftKey;
}
