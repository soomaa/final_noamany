import { uiStatic } from '@/lib/ui-static';

export type AttendeeSource = "qr" | "direct";

export const SOURCE_META: Record<AttendeeSource, { label: string; classes: string }> = {
  qr: { label: "QR", classes: "bg-[#7CB342]/15 text-[#558B2F] border-[#7CB342]/30" },
  direct: { label: uiStatic("تسجيل مباشر"), classes: "bg-[#D4A229]/15 text-[#A8801F] border-[#D4A229]/40" },
};

/** Normalize raw source values — legacy "screen" rows are folded into "direct". */
export const normalizeSource = (s?: string | null): AttendeeSource =>
  s === "qr" ? "qr" : "direct";

export const getSourceMeta = (s?: string | null) => SOURCE_META[normalizeSource(s)];