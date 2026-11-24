import {
  ageOn,
  birthdaySuffixes,
  classifyRecipients,
  displayPhone,
  formatDate,
  hasLink,
  isStopReply,
  renderTemplate,
  templateVersions,
  toWhatsAppPhone,
  varyTemplate,
  withOptOutLine,
} from './wa-campaigns.utils';

describe('WhatsApp campaign helpers', () => {
  it('turns stored Egyptian mobiles into international digits and rejects what WhatsApp cannot reach', () => {
    expect(toWhatsAppPhone('01012345678')).toBe('201012345678');
    expect(toWhatsAppPhone('+20 101 234 5678')).toBe('201012345678');
    expect(toWhatsAppPhone('00201512345678')).toBe('201512345678');
    expect(toWhatsAppPhone('1112345678')).toBe('201112345678');
    expect(toWhatsAppPhone('+971501234567')).toBe('971501234567');
    expect(toWhatsAppPhone('0223456789')).toBeNull(); // Cairo landline
    expect(toWhatsAppPhone('01312345678')).toBeNull(); // no such mobile prefix
    expect(toWhatsAppPhone('2023456789')).toBeNull();
    expect(toWhatsAppPhone('')).toBeNull();
    expect(displayPhone('201012345678')).toBe('01012345678');
    expect(displayPhone('971501234567')).toBe('+971501234567');
  });

  it('fills known variables and leaves unknown ones visible', () => {
    expect(renderTemplate('أهلًا {first_name}، اشتراكك {package} انتهى {end_date} {unknown}', { first_name: 'سارة', package: 'شهري', end_date: formatDate('2026-10-21') }))
      .toBe('أهلًا سارة، اشتراكك شهري انتهى 21/10/2026 {unknown}');
  });

  it('skips in a fixed order and sends one message per shared phone', () => {
    const rows = [
      { memberId: 1, phoneRaw: '01012345678' },
      { memberId: 2, phoneRaw: '01012345678' }, // same family phone
      { memberId: 3, phoneRaw: null },
      { memberId: 4, phoneRaw: '0223456789' },
      { memberId: 5, phoneRaw: '01112345678' },
      { memberId: 6, phoneRaw: '01212345678' },
      { memberId: 7, phoneRaw: '01512345678' },
    ];
    const out = classifyRecipients(rows, {
      optedOut: new Set(['201112345678']),
      recentlyMessaged: new Set(['201212345678']),
      excludedMemberIds: new Set([7]),
    });
    expect(out.map((r) => r.skip)).toEqual([null, 'duplicate_phone', 'no_phone', 'invalid_phone', 'opted_out', 'recently_messaged', 'excluded_manually']);
  });

  it('skips numbers WhatsApp already said are not registered', () => {
    const out = classifyRecipients([{ memberId: 1, phoneRaw: '01012345678' }], {
      optedOut: new Set(), recentlyMessaged: new Set(), excludedMemberIds: new Set(), notOnWhatsApp: new Set(['201012345678']),
    });
    expect(out[0].skip).toBe('not_on_whatsapp');
  });

  it('picks one version and one choice per {a|b} without touching variables', () => {
    const body = '{أهلًا|إزيك} {first_name}\nاشتراكك انتهى\n---\nمساء الخير {first_name} 👋\n  ---  \n';
    expect(templateVersions(body)).toEqual(['{أهلًا|إزيك} {first_name}\nاشتراكك انتهى', 'مساء الخير {first_name} 👋']);
    expect(varyTemplate(body, () => 0)).toBe('أهلًا {first_name}\nاشتراكك انتهى');
    const seq = [0, 0.9]; // first version, second choice
    expect(varyTemplate(body, () => seq.shift() ?? 0)).toBe('إزيك {first_name}\nاشتراكك انتهى');
    expect(varyTemplate(body, () => 0.99)).toBe('مساء الخير {first_name} 👋');
    expect(varyTemplate('بدون اختيارات {first_name}', () => 0.5)).toBe('بدون اختيارات {first_name}');
    expect(varyTemplate('{تمام|} يا {name}', () => 0.99)).toBe(' يا {name}');
    const seen = new Set(Array.from({ length: 12 }, (_, i) => varyTemplate('{a|b|c} {x|y}', () => (i % 6) / 6)));
    expect(seen.size).toBeGreaterThan(2);
  });

  it('adds a varied stop line unless the text already explains how to stop', () => {
    expect(withOptOutLine('أهلًا سارة', () => 0)).toBe('أهلًا سارة\n\nلو مش حابب توصلك رسايل مننا ابعت «إيقاف»');
    expect(withOptOutLine('أهلًا', () => 0.99)).toMatch(/«إيقاف»$/);
    expect(withOptOutLine('ابعت ايقاف لو مش عايز', () => 0)).toBe('ابعت ايقاف لو مش عايز');
  });

  it('recognises short stop replies only', () => {
    for (const t of ['إيقاف', 'ايقاف 🙏', 'Stop', 'وقف الرسايل', 'الغاء']) expect(isStopReply(t)).toBe(true);
    for (const t of ['', 'تمام شكرًا', 'أنا هجدد بكره بس عايز أعرف الإيقاف بيتحسب ازاي', 'stopwatch']) expect(isStopReply(t)).toBe(false);
  });

  it('flags links in a message', () => {
    expect(hasLink('جدد من https://gym.example.com')).toBe(true);
    expect(hasLink('ادخل www.gym.eg')).toBe(true);
    expect(hasLink('انتهى يوم 21/10/2026. جدّد دلوقتي')).toBe(false);
  });

  it('finds today\'s birthdays, greeting 29 February people on 28 February of a non-leap year', () => {
    expect(birthdaySuffixes('2026-11-24')).toEqual(['-11-24']);
    expect(birthdaySuffixes('2027-02-28')).toEqual(['-02-28', '-02-29']);
    expect(birthdaySuffixes('2028-02-28')).toEqual(['-02-28']);
    expect(birthdaySuffixes('2028-02-29')).toEqual(['-02-29']);
  });

  it('computes the age reached today and drops placeholder dates', () => {
    expect(ageOn('1995-11-24', '2026-11-24')).toBe(31);
    expect(ageOn('1995-12-01', '2026-11-24')).toBe(30);
    expect(ageOn('2000-02-29', '2027-02-28')).toBe(27);
    expect(ageOn('1970-01-01', '2026-01-01')).toBeNull();
    expect(ageOn('1112-11-24', '2026-11-24')).toBeNull();
    expect(ageOn('2222-11-24', '2026-11-24')).toBeNull();
    expect(ageOn('24-11-1995', '2026-11-24')).toBeNull();
  });

  it('skips a member already greeted, by member not by phone', () => {
    const rows = classifyRecipients(
      [{ memberId: 1, phoneRaw: '01012345678' }, { memberId: 2, phoneRaw: '01112345678' }],
      { optedOut: new Set(), recentlyMessaged: new Set(), excludedMemberIds: new Set(), alreadyGreeted: new Set([1]) },
    );
    expect(rows.map((r) => r.skip)).toEqual(['already_greeted', null]);
  });
});
