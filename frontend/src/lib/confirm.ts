import { create } from 'zustand';
import type { ReactNode } from 'react';

export interface ConfirmPreviewRow {
  label: string;
  before?: string;
  after?: string;
}

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive';
  /** Preview rows shown before confirm (PART 1A). */
  rows?: ConfirmPreviewRow[];
  warning?: string;
}

interface ConfirmState {
  open: boolean;
  options: ConfirmOptions | null;
  resolve: ((value: boolean) => void) | null;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  handleConfirm: () => void;
  handleCancel: () => void;
}

/** Run after Radix dropdown/popover closes to avoid stacked focus traps freezing the page. */
export function afterMenuClose(fn: () => void): void {
  setTimeout(fn, 0);
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  open: false,
  options: null,
  resolve: null,

  confirm: (options) =>
    new Promise<boolean>((resolve) => {
      afterMenuClose(() => {
        set({ open: true, options, resolve });
      });
    }),

  handleConfirm: () => {
    const { resolve } = get();
    resolve?.(true);
    set({ open: false, options: null, resolve: null });
  },

  handleCancel: () => {
    const { resolve } = get();
    resolve?.(false);
    set({ open: false, options: null, resolve: null });
  },
}));

export function confirm(options: ConfirmOptions): Promise<boolean> {
  return useConfirmStore.getState().confirm(options);
}

/**
 * Fetch dry-run preview from API, show confirm dialog with rows, then run commit on approve.
 */
export async function confirmWithPreview(
  options: Omit<ConfirmOptions, 'rows' | 'warning'>,
  fetchPreview: () => Promise<{ rows?: ConfirmPreviewRow[]; warning?: string }>,
  onCommit: () => Promise<void>,
): Promise<boolean> {
  const preview = await fetchPreview();
  const ok = await confirm({
    ...options,
    rows: preview.rows,
    warning: preview.warning,
  });
  if (ok) await onCommit();
  return ok;
}

export type { ReactNode };
