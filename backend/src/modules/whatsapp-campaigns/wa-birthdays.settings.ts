import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Birthday-greeting settings live in `wa_control_settings` row 2 (row 1 holds the WhatsApp Web
 * selectors), so this feature needs no new table and no new Prisma Client.
 */
export const BIRTHDAY_SETTINGS_ROW = 2;

export interface BirthdaySettings {
  enabled: boolean;
  /** Cairo time (HH:MM) the day's greetings are queued. */
  time: string;
  /** The wa_templates row used for birthdays; created with the default text on first use. */
  templateId: number | null;
  /** Only members holding a subscription that has not ended yet. */
  activeOnly: boolean;
  /** branchId → last Cairo day the automatic greetings were queued for it. */
  runs: Record<string, string>;
}

export const DEFAULT_BIRTHDAY_SETTINGS: BirthdaySettings = { enabled: false, time: '09:00', templateId: null, activeOnly: false, runs: {} };

export const DEFAULT_BIRTHDAY_TEMPLATE_NAME = 'تهنئة عيد الميلاد 🎂';
export const DEFAULT_BIRTHDAY_TEMPLATE = [
  '{كل سنة وانت طيب|كل سنة وانت بخير|سنة حلوة عليك} يا {first_name} 🎂🎉',
  'كل فريق {branch} بيتمنالك سنة جديدة مليانة صحة وفرحة 💪',
  '{مستنيينك في الجيم نحتفل بيك|منورنا دايمًا} ❤️',
  '---',
  '{first_name} 🎈 {عيد ميلاد سعيد|كل سنة وانت طيب}!',
  '{أسرة|فريق} {branch} {بيقولك|بيبعتلك} سنة حلوة عليك 🎁',
  'نتمنالك سنة كلها {إنجازات|صحة وسعادة} 💪✨',
].join('\n');

type Db = PrismaService | Prisma.TransactionClient;

export async function readBirthdaySettings(prisma: Db): Promise<BirthdaySettings> {
  const row = await prisma.wa_control_settings.findUnique({ where: { id: BIRTHDAY_SETTINGS_ROW } });
  const stored = (row?.selectors ?? {}) as Partial<BirthdaySettings>;
  return { ...DEFAULT_BIRTHDAY_SETTINGS, ...stored, runs: { ...(stored.runs ?? {}) } };
}

export async function writeBirthdaySettings(prisma: Db, settings: BirthdaySettings) {
  const value = settings as unknown as Prisma.InputJsonValue;
  await prisma.wa_control_settings.upsert({
    where: { id: BIRTHDAY_SETTINGS_ROW },
    create: { id: BIRTHDAY_SETTINGS_ROW, selectors: value },
    update: { selectors: value },
  });
}
