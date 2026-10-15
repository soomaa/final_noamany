import type { JournalEntryRow, JournalEntryType } from '@/types/accounting';

/**
 * Pure model behind the journal-entry editor.
 *
 * The editor is built around two visible halves — مدين and دائن — while the API takes a
 * single flat `lines` array where each line carries either a debit or a credit. `side`
 * is the bridge: it keeps the two halves addressable in the UI without ever letting a
 * line end up with both a debit and a credit, which the backend rejects outright.
 */

export const ENTRY_TYPE_ORDER: JournalEntryType[] = ['daily', 'monthly', 'annual'];

export const ENTRY_TYPE_LABELS: Record<JournalEntryType, string> = {
  daily: 'يومي',
  monthly: 'شهري',
  annual: 'سنوي',
};

export const STATUS_META: Record<
  JournalEntryRow['status'],
  { label: string; variant: 'default' | 'success' | 'warning' | 'destructive' }
> = {
  draft: { label: 'مسودة', variant: 'warning' },
  posted: { label: 'مرحّل', variant: 'success' },
  reversed: { label: 'معكوس', variant: 'destructive' },
};

export interface DraftLine {
  side: 'debit' | 'credit';
  /** Account id as a string, because that is what the Select round-trips. */
  accountId: string;
  /** Raw input text; parsed only at totalling and submit time. */
  amount: string;
  description: string;
}

export interface DraftEntry {
  date: string;
  entryType: JournalEntryType;
  reference: string;
  description: string;
  lines: DraftLine[];
}

/** A fresh entry opens with the minimum a balanced entry needs: one debit, one credit. */
export function blankDraft(date: string): DraftEntry {
  return {
    date,
    entryType: 'daily',
    reference: '',
    description: '',
    lines: [
      { side: 'debit', accountId: '', amount: '', description: '' },
      { side: 'credit', accountId: '', amount: '', description: '' },
    ],
  };
}

function amountOf(line: DraftLine): number {
  const n = Number(line.amount);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface DraftTotals {
  totalDebit: number;
  totalCredit: number;
  difference: number;
  isBalanced: boolean;
}

export function draftTotals(draft: DraftEntry): DraftTotals {
  let totalDebit = 0;
  let totalCredit = 0;
  for (const line of draft.lines) {
    if (line.side === 'debit') totalDebit += amountOf(line);
    else totalCredit += amountOf(line);
  }
  totalDebit = round2(totalDebit);
  totalCredit = round2(totalCredit);
  const difference = round2(totalDebit - totalCredit);
  return {
    totalDebit,
    totalCredit,
    difference,
    // Matches the backend tolerance, so a draft that looks balanced here is never
    // rejected on save for a rounding hair.
    isBalanced: Math.abs(difference) <= 0.01,
  };
}

/**
 * Flatten the draft into the API's line shape. Lines with no account or a zero amount
 * are dropped: the backend rejects a line that is neither a debit nor a credit, so an
 * untouched spare row must not be sent.
 */
export function toApiLines(draft: DraftEntry) {
  return draft.lines
    .filter((line) => line.accountId !== '' && amountOf(line) > 0)
    .map((line) => ({
      accountId: Number(line.accountId),
      debit: line.side === 'debit' ? round2(amountOf(line)) : 0,
      credit: line.side === 'credit' ? round2(amountOf(line)) : 0,
      description: line.description.trim() || undefined,
    }));
}
