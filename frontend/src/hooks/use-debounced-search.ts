import { useEffect, useRef, useState } from 'react';

/** Keep typing local; an acknowledgement of an older commit must not erase newer text. */
export function useDebouncedSearch(value: string, onCommit: (value: string) => void, delay = 300) {
  const [draft, setDraft] = useState(value);
  const draftRef = useRef(value);
  const committed = useRef(value);
  const callback = useRef(onCommit);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const composing = useRef(false);

  useEffect(() => { callback.current = onCommit; }, [onCommit]);

  const cancel = () => {
    clearTimeout(timer.current);
    timer.current = undefined;
  };
  const flush = () => {
    cancel();
    const next = draftRef.current;
    if (next !== committed.current) {
      committed.current = next;
      callback.current(next);
    }
    return next;
  };
  const change = (next: string) => {
    draftRef.current = next;
    setDraft(next);
    cancel();
    if (!composing.current) timer.current = setTimeout(flush, delay);
  };

  useEffect(() => {
    if (value === committed.current) return;
    cancel();
    committed.current = value;
    draftRef.current = value;
    setDraft(value);
  }, [value]);
  useEffect(() => cancel, []);

  return {
    draft, change, flush,
    onCompositionStart: () => { composing.current = true; cancel(); },
    onCompositionEnd: (value: string) => { composing.current = false; change(value); },
  };
}
