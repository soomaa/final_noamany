import { useEffect, useRef } from 'react';

interface ScannerBufferOptions {
  minLength?: number;
  maxGapMs?: number;
}

interface ScannerKeyResult {
  code: string | null;
  preventDefault: boolean;
}

export class HardwareScannerBuffer {
  private buffer = '';
  private lastAt = 0;
  private readonly minLength: number;
  private readonly maxGapMs: number;

  constructor(options: ScannerBufferOptions = {}) {
    this.minLength = options.minLength ?? 4;
    this.maxGapMs = options.maxGapMs ?? 120;
  }

  push(key: string, now: number, modified = false): ScannerKeyResult {
    if (now - this.lastAt > this.maxGapMs) this.buffer = '';
    this.lastAt = now;

    if (key === 'Enter' || key === 'Tab') {
      const pending = this.buffer.length >= this.minLength;
      return { code: this.flush(), preventDefault: pending };
    }
    if (!modified && key.length === 1) this.buffer += key;
    return { code: null, preventDefault: false };
  }

  flush(): string | null {
    const code = this.buffer.replace(/[\u0000-\u001f\u007f]/g, '').trim();
    this.buffer = '';
    return code.length >= this.minLength ? code : null;
  }
}

export function isScannerTypingTarget(target: Pick<HTMLElement, 'tagName' | 'isContentEditable'> | null) {
  if (!target) return false;
  return target.tagName === 'INPUT'
    || target.tagName === 'TEXTAREA'
    || target.tagName === 'SELECT'
    || target.isContentEditable;
}

export function useHardwareScanner(
  onScan: (code: string) => void,
  options: ScannerBufferOptions & { flushMs?: number; enabled?: boolean } = {},
) {
  const { minLength = 4, maxGapMs = 120, flushMs = 260, enabled = true } = options;
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) return;
    const buffer = new HardwareScannerBuffer({ minLength, maxGapMs });
    let flushTimer: ReturnType<typeof setTimeout> | undefined;

    const emit = (code: string | null) => {
      if (code) onScanRef.current(code);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (isScannerTypingTarget(event.target as HTMLElement | null)) return;
      const modified = event.ctrlKey || event.altKey || event.metaKey;
      clearTimeout(flushTimer);
      const result = buffer.push(event.key, Date.now(), modified);
      if (result.preventDefault) event.preventDefault();
      emit(result.code);
      if (!result.code && !modified && event.key.length === 1) {
        flushTimer = setTimeout(() => emit(buffer.flush()), flushMs);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      clearTimeout(flushTimer);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [enabled, flushMs, maxGapMs, minLength]);
}
