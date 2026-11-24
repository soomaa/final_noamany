import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, apiError } from '@/lib/api';
import { localToday } from '@/lib/formatters';
import { whatsappMessageLink, whatsappPhone } from '@/lib/member-whatsapp';
import { isMaskedValue } from '@/lib/masked-value';
import { resolvePhone } from '@/components/club/masked-phone';
import {
  DEFAULT_WHATSAPP_TEMPLATES,
  mergeWhatsAppTemplates,
  subscriptionMessage,
  type WhatsAppKind,
  type WhatsAppValues,
} from '@/lib/whatsapp-message';
import type { ClubSubscriptionListItem } from '@/types/club';

export const WHATSAPP_TEMPLATES_QUERY_KEY = ['club-whatsapp-templates'] as const;

/** Saved «قوالب واتساب» merged over the defaults. A failed load falls back to the defaults. */
export function useWhatsAppTemplates() {
  return useQuery({
    queryKey: WHATSAPP_TEMPLATES_QUERY_KEY,
    queryFn: async ({ signal }) => mergeWhatsAppTemplates((await api.get<unknown>('/club-whatsapp-templates', { signal })).data),
    staleTime: 30_000,
    retry: 1,
  });
}

/** Display name used in every message. */
export const GYM_NAME = 'النعماني';

/**
 * Open the member's WhatsApp chat with the message typed in. Long messages are copied whole
 * instead (the browser URL limit would cut them). Returns false when nothing was opened.
 */
export async function openWhatsAppMessage(
  phone: string | null | undefined,
  message: string,
  tab?: Window | null,
  ids?: { memberId?: number | null; leadId?: number | null },
): Promise<boolean> {
  // A masked number (phone privacy) is fetched through the audited reveal first. The tab is
  // reserved now, inside the click, so the popup blocker does not eat it during the request.
  if (isMaskedValue(phone)) {
    if (!tab) {
      tab = window.open('about:blank', '_blank');
      if (tab) tab.opener = null;
    }
    phone = ids ? await resolvePhone(phone, ids) : null;
    if (!phone) {
      tab?.close();
      toast.error('مش مسموح لك تشوف رقم العضو ده، أو العضو مالوش رقم.');
      return false;
    }
  }
  const number = whatsappPhone(phone);
  if (!number) {
    tab?.close();
    toast.error('رقم الموبايل مش رقم واتساب صالح. راجع رقم العضو.');
    return false;
  }
  const long = message.length > 6000;
  if (long) {
    try {
      await navigator.clipboard.writeText(message);
    } catch {
      tab?.close();
      toast.error('تعذر نسخ الرسالة الطويلة؛ انسخها يدويًا');
      return false;
    }
  }
  const url = whatsappMessageLink(number, long ? '' : message);
  let opened = false;
  try {
    if (tab && !tab.closed) {
      tab.location.replace(url);
      opened = true;
    }
  } catch {
    tab?.close();
  }
  // With noopener, window.open returns null even on success, so its result proves nothing.
  if (!opened) window.open(url, '_blank', 'noopener,noreferrer');
  if (long) toast.info('الرسالة طويلة واتنسخت كاملة؛ الصقها في المحادثة قبل الإرسال.');
  return true;
}

/**
 * «حفظ وإرسال واتساب» (like Meta Fit) for any subscription operation: `run(kind, save)` runs the
 * normal save; the save calls `target(id, operation)` when it succeeds, then the member's WhatsApp
 * opens with that operation's template. Nothing opens when the save does not succeed.
 */
export function useSaveAndWhatsApp() {
  const templates = useWhatsAppTemplates();
  type Target = { id: number; operation?: WhatsAppValues };
  const targetRef = useRef<Target | null>(null);

  const send = async (
    kind: WhatsAppKind,
    subscriptionId: number,
    operation: WhatsAppValues = {},
    tab: Window | null = null,
    fallbackPhone?: string | null,
  ) => {
    try {
      const { data: saved } = await api.get<ClubSubscriptionListItem>(`/club-subscriptions/${subscriptionId}`);
      const template = (templates.data ?? DEFAULT_WHATSAPP_TEMPLATES)[kind];
      const message = subscriptionMessage(template, saved, { today: localToday(), gymName: GYM_NAME }, operation);
      await openWhatsAppMessage(saved.memberPhone || fallbackPhone, message, tab, { memberId: saved.memberId });
    } catch (error) {
      tab?.close();
      toast.warning(`تم الحفظ، لكن تعذر تجهيز رسالة واتساب: ${apiError(error)}`);
    }
  };

  return {
    /** Record what a successful save should send. */
    target: (id: number, operation?: WhatsAppValues) => {
      targetRef.current = { id, operation };
    },
    /** Run a save, then open WhatsApp for whatever it recorded. */
    run: async (kind: WhatsAppKind, save: () => Promise<unknown>, fallbackPhone?: string | null) => {
      // Reserve the tab inside the click; a window opened after the save would be popup-blocked.
      const tab = window.open('about:blank', '_blank');
      if (tab) tab.opener = null;
      targetRef.current = null;
      await save();
      // `save` sets the ref; TypeScript cannot see that through the await.
      const target = targetRef.current as Target | null;
      targetRef.current = null;
      if (!target) {
        tab?.close();
        return;
      }
      await send(kind, target.id, target.operation, tab, fallbackPhone);
    },
    /** Open the message straight from a click (e.g. the action on a success toast). */
    sendNow: (kind: WhatsAppKind, subscriptionId: number, operation?: WhatsAppValues) => {
      const tab = window.open('about:blank', '_blank');
      if (tab) tab.opener = null;
      void send(kind, subscriptionId, operation, tab);
    },
  };
}
