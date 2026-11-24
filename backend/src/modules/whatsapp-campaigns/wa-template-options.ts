import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Per-template options kept in `wa_control_settings` row 3 (row 1 = WhatsApp Web selectors,
 * row 2 = birthday greetings), so no new column or Prisma Client is needed.
 */
const TEMPLATE_OPTIONS_ROW = 3;

interface TemplateOptions {
  /** Templates whose messages go out without the automatic «ابعت إيقاف» line. */
  noOptOutLine: number[];
}

type Db = PrismaService | Prisma.TransactionClient;

export async function readTemplateOptions(prisma: Db): Promise<TemplateOptions> {
  const row = await prisma.wa_control_settings.findUnique({ where: { id: TEMPLATE_OPTIONS_ROW } });
  const stored = (row?.selectors ?? {}) as Partial<TemplateOptions>;
  return { noOptOutLine: Array.isArray(stored.noOptOutLine) ? stored.noOptOutLine.filter((id) => Number.isInteger(id)) : [] };
}

/** Turn the automatic opt-out line on or off for one template. */
export async function setOptOutLine(prisma: Db, templateId: number, addLine: boolean) {
  const options = await readTemplateOptions(prisma);
  const ids = new Set(options.noOptOutLine);
  if (addLine) ids.delete(templateId);
  else ids.add(templateId);
  const value = { noOptOutLine: [...ids].sort((a, b) => a - b) } as unknown as Prisma.InputJsonValue;
  await prisma.wa_control_settings.upsert({
    where: { id: TEMPLATE_OPTIONS_ROW },
    create: { id: TEMPLATE_OPTIONS_ROW, selectors: value },
    update: { selectors: value },
  });
}
