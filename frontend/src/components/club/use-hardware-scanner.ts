import { useEffect, useRef } from 'react';

interface HardwareScannerWedgeOptions {
  minLength?: number;
  maxGapMs?: number;
  flushMs?: number;
}

interface HardwareScannerKey {
  key: string;
  at?: number;
  typingTarget?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  isComposing?: boolean;
  repeat?: boolean;
}

export function createHardwareScannerWedge(
  onScan: (code: string) => void,
  options: HardwareScannerWedgeOptions = {},
) {
  const { minLength = 4, maxGapMs = 120, flushMs = 260 } = options;
  let buffer = '';
  let lastAt = 0;
  let flushTimer: ReturnType<typeof setTimeout> | undefined;

  const clear = () => {
    clearTimeout(flushTimer);
    flushTimer = undefined;
    buffer = '';
    lastAt = 0;
  };
  const emit = () => {
    const code = buffer.replace(/[\u0000-\u001f\u007f]/g, '').trim();
    clear();
    if (code.length >= minLength) onScan(code);
  };
  const handle = (event: HardwareScannerKey) => {
    if (
      event.typingTarget
      || event.ctrlKey
      || event.altKey
      || event.metaKey
      || event.isComposing
      || event.repeat
    ) {
      clear();
      return false;
    }

    const now = event.at ?? Date.now();
    if (lastAt > 0 && now - lastAt > maxGapMs) buffer = '';
    lastAt = now;
    clearTimeout(flushTimer);
    flushTimer = undefined;

    if (event.key === 'Enter' || event.key === 'Tab') {
      const shouldPreventDefault = buffer.length >= minLength;
      emit();
      return shouldPreventDefault;
    }
    if (event.key.length === 1) {
      buffer += event.key;
      flushTimer = setTimeout(emit, flushMs);
    }
    return false;
  };

  return { handle, dispose: clear };
}

/**
 * Read a USB handheld barcode scanner (keyboard-wedge) anywhere on the page.
 *
 * These scanners are HID keyboards: they type the barcode very fast and finish with
 * Enter. Reception desks run on PCs with no camera, so the camera scanner is useless
 * there and the operator otherwise has to remember to click the search box first.
 * This listens globally and fires `onScan` when a burst of keystrokes ends in Enter.
 *
 * Scanners are configured with one of three suffixes, and reception desks rarely know
 * which: Enter, Tab, or nothing at all. All three are handled — Enter and Tab end the
 * code immediately, and a burst that just stops is flushed after `flushMs`. Reading only
 * Enter meant a Tab-suffixed scanner appeared completely dead.
 *
 * A human typing is filtered out two ways: the gap between characters must stay under
 * `maxGapMs`, and the whole code must be at least `minLength` characters. Typing into a
 * real field is left alone — the field's own handler owns that input.
 */
export function useHardwareScanner(
  onScan: (code: string) => void,
  options: { minLength?: number; maxGapMs?: number; flushMs?: number; enabled?: boolean } = {},
) {
  const { minLength = 4, maxGapMs = 120, flushMs = 260, enabled = true } = options;
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) return;

    const isTypingTarget = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        el.isContentEditable === true
      );
    };

    const wedge = createHardwareScannerWedge(
      (code) => onScanRef.current(code),
      { minLength, maxGapMs, flushMs },
    );

    const onKeyDown = (event: KeyboardEvent) => {
      const shouldPreventDefault = wedge.handle({
        key: event.key,
        typingTarget: isTypingTarget(event.target),
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
        isComposing: event.isComposing,
        repeat: event.repeat,
      });
      if (shouldPreventDefault) event.preventDefault();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      wedge.dispose();
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [enabled, minLength, maxGapMs, flushMs]);
}
