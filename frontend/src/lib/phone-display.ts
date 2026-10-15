/**
 * Phone numbers are stored with a country code. Staff read the national form,
 * so a known Arab mobile is shown as `0` plus the national digits.
 */
const COUNTRIES: ReadonlyArray<{ dialCode: string; national: RegExp }> = [
  { dialCode: '20', national: /^1[0-9]{9}$/ },
  { dialCode: '966', national: /^5[0-9]{8}$/ },
  { dialCode: '971', national: /^5[0-9]{8}$/ },
  { dialCode: '965', national: /^[569][0-9]{7}$/ },
  { dialCode: '974', national: /^[3567][0-9]{7}$/ },
  { dialCode: '973', national: /^[36][0-9]{7}$/ },
  { dialCode: '968', national: /^[79][0-9]{7}$/ },
  { dialCode: '962', national: /^7[789][0-9]{7}$/ },
  { dialCode: '961', national: /^[37][0-9]{6,7}$/ },
  { dialCode: '964', national: /^7[0-9]{9}$/ },
  { dialCode: '963', national: /^9[0-9]{8}$/ },
  { dialCode: '970', national: /^5[69][0-9]{6}$/ },
  { dialCode: '212', national: /^[67][0-9]{8}$/ },
  { dialCode: '213', national: /^[567][0-9]{8}$/ },
  { dialCode: '216', national: /^[2459][0-9]{7}$/ },
  { dialCode: '218', national: /^9[0-9]{8}$/ },
  { dialCode: '249', national: /^9[0-9]{8}$/ },
  { dialCode: '967', national: /^7[0-9]{8}$/ },
];

const BY_LENGTH = [...COUNTRIES].sort((a, b) => b.dialCode.length - a.dialCode.length);

export function phoneNational(phone: string | null | undefined): string {
  const raw = String(phone ?? '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (!digits) return raw;
  for (const country of BY_LENGTH) {
    if (!digits.startsWith(country.dialCode)) continue;
    const rest = digits.slice(country.dialCode.length);
    if (country.national.test(rest)) return `0${rest}`;
  }
  return raw;
}
