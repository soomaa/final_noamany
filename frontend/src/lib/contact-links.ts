/**
 * Egyptian mobile numbers are stored the way they are dialled locally — `01xxxxxxxxx`, no
 * country code (all 5,040 member numbers in production look like this). wa.me needs the
 * international form, so a link built from the raw digits is `wa.me/01…`, which WhatsApp
 * rejects every single time. The sales team concluded the button was simply broken.
 */
export function toWhatsAppLink(phone: string | null | undefined, message?: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  let international = digits;
  if (digits.startsWith('00')) international = digits.slice(2);
  else if (digits.startsWith('0') && digits.length >= 10) international = `20${digits.slice(1)}`;
  else if (digits.length === 10 && digits.startsWith('1')) international = `20${digits}`;
  if (international.length < 10) return null;
  const url = `https://wa.me/${international}`;
  return message ? `${url}?text=${encodeURIComponent(message)}` : url;
}

/**
 * A WhatsApp Web chat link (opens the chat directly in an already signed-in WhatsApp Web,
 * without the wa.me landing page). Same number normalisation as toWhatsAppLink.
 */
export function toWhatsAppWebLink(phone: string | null | undefined, message?: string): string | null {
  const link = toWhatsAppLink(phone);
  if (!link) return null;
  const number = link.slice('https://wa.me/'.length);
  return `https://web.whatsapp.com/send?phone=${number}${message ? `&text=${encodeURIComponent(message)}` : ''}`;
}

/** A dialable `tel:` href. The local form works for the phone's own dialer. */
export function toDialLink(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/[^\d+]/g, '');
  return digits.length >= 7 ? `tel:${digits}` : null;
}
