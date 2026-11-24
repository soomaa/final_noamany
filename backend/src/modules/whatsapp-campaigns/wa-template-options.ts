import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { TemplateField } from './wa-campaigns.utils';

/**
 * WhatsApp template options kept in `wa_control_settings` row 3 (row 1 = WhatsApp Web selectors,
 * row 2 = birthday greetings), so no new column or Prisma Client is needed.
 */
const TEMPLATE_OPTIONS_ROW = 3;

export interface AbsenceSettings {
  /** Last visit this many days before the check-in → yellow row and the WhatsApp button. */
  yellowDays: number;
  /** …and this many days or more → red row. */
  redDays: number;
  /** The «لم يحضر منذ مدة» template; created with the default text on first use. */
  templateId: number | null;
}

/** «عدم الالتزام بالحضور»: the message offered on the member commitment report. */
export interface CommitmentSettings {
  templateId: number | null;
}

export interface TemplateOptions {
  /** Templates whose messages go out without the automatic «ابعت إيقاف» line. */
  noOptOutLine: number[];
  /** templateId → the fields staff edit (the body is generated from them). */
  fields: Record<string, TemplateField[]>;
  /** Default templates already created once (a template staff delete is not recreated). */
  seeded: string[];
  absence: AbsenceSettings;
  commitment: CommitmentSettings;
}

export const DEFAULT_ABSENCE: AbsenceSettings = { yellowDays: 5, redDays: 10, templateId: null };
export const DEFAULT_COMMITMENT: CommitmentSettings = { templateId: null };

type Db = PrismaService | Prisma.TransactionClient;

export async function readTemplateOptions(prisma: Db): Promise<TemplateOptions> {
  const row = await prisma.wa_control_settings.findUnique({ where: { id: TEMPLATE_OPTIONS_ROW } });
  const stored = (row?.selectors ?? {}) as Partial<TemplateOptions>;
  return {
    noOptOutLine: Array.isArray(stored.noOptOutLine) ? stored.noOptOutLine.filter((id) => Number.isInteger(id)) : [],
    fields: stored.fields && typeof stored.fields === 'object' ? { ...stored.fields } : {},
    seeded: Array.isArray(stored.seeded) ? [...stored.seeded] : [],
    absence: { ...DEFAULT_ABSENCE, ...(stored.absence ?? {}) },
    commitment: { ...DEFAULT_COMMITMENT, ...(stored.commitment ?? {}) },
  };
}

export async function writeTemplateOptions(prisma: Db, options: TemplateOptions) {
  const value = options as unknown as Prisma.InputJsonValue;
  await prisma.wa_control_settings.upsert({
    where: { id: TEMPLATE_OPTIONS_ROW },
    create: { id: TEMPLATE_OPTIONS_ROW, selectors: value },
    update: { selectors: value },
  });
}

/** Read, change, write — every caller goes through here so one option never wipes another. */
export async function updateTemplateOptions(prisma: Db, change: (options: TemplateOptions) => void) {
  const options = await readTemplateOptions(prisma);
  change(options);
  await writeTemplateOptions(prisma, options);
  return options;
}

/** Turn the automatic opt-out line on or off for one template. */
export async function setOptOutLine(prisma: Db, templateId: number, addLine: boolean) {
  await updateTemplateOptions(prisma, (o) => {
    const ids = new Set(o.noOptOutLine);
    if (addLine) ids.delete(templateId);
    else ids.add(templateId);
    o.noOptOutLine = [...ids].sort((a, b) => a - b);
  });
}
