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

export function toDialLink(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/[^\d+]/g, '');
  return digits.length >= 7 ? `tel:${digits}` : null;
}
