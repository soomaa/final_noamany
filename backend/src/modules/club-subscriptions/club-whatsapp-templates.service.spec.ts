import { BadRequestException } from '@nestjs/common';
import {
  ClubWhatsAppTemplatesService,
  WHATSAPP_TEMPLATE_CATEGORY,
  validWhatsAppTemplate,
} from './club-whatsapp-templates.service';

type Row = { id: number; branch_id: number | null; category: string; setting_key: string; setting_value: string; is_active: boolean };

/** In-memory stand-in for sales_pos_settings, enough for the templates service. */
function makePrisma(seed: Row[] = []) {
  let rows = [...seed];
  let nextId = 100;
  const matches = (row: Row, where: Record<string, unknown>) =>
    Object.entries(where).every(([key, value]) => {
      if (key === 'id' && value && typeof value === 'object' && 'in' in value) return (value as { in: number[] }).in.includes(row.id);
      return (row as unknown as Record<string, unknown>)[key] === value;
    });
  const table = {
    findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) => rows.filter((row) => matches(row, where))),
    deleteMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const before = rows.length;
      rows = rows.filter((row) => !matches(row, where));
      return { count: before - rows.length };
    }),
    update: jest.fn(async ({ where, data }: { where: { id: number }; data: Partial<Row> }) => {
      const row = rows.find((item) => item.id === where.id)!;
      Object.assign(row, data);
      return row;
    }),
    create: jest.fn(async ({ data }: { data: Omit<Row, 'id' | 'is_active'> }) => {
      const row = { id: nextId++, is_active: true, ...data } as Row;
      rows.push(row);
      return row;
    }),
  };
  const prisma = {
    sales_pos_settings: table,
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({ sales_pos_settings: table })),
    rows: () => rows,
  };
  return prisma;
}

const row = (id: number, key: string, value: string, patch: Partial<Row> = {}): Row => ({
  id, branch_id: null, category: WHATSAPP_TEMPLATE_CATEGORY, setting_key: key, setting_value: value, is_active: true, ...patch,
});

describe('WhatsApp templates (sales_pos_settings storage)', () => {
  it('validates fields and braces', () => {
    expect(validWhatsAppTemplate('أهلًا {{member_name}} باقي {{days_left}} يوم')).toBe(true);
    expect(validWhatsAppTemplate('{{unknown_field}}')).toBe(false);
    expect(validWhatsAppTemplate('اشتراك {member_name}')).toBe(false);
    expect(validWhatsAppTemplate('   ')).toBe(false);
    expect(validWhatsAppTemplate('x'.repeat(3001))).toBe(false);
    expect(validWhatsAppTemplate(42)).toBe(false);
  });

  it('returns only valid saved templates of known kinds', async () => {
    const prisma = makePrisma([
      row(1, 'expiring', 'باقي {{days_left}} يوم'),
      row(2, 'not_a_kind', 'x'),
      row(3, 'expired', '{{broken'),
      row(4, 'subscription', 'branch row', { branch_id: 3 }),
      row(5, 'renewal', 'other category', { category: 'general' }),
    ]);
    const service = new ClubWhatsAppTemplatesService(prisma as never);
    await expect(service.get()).resolves.toEqual({ expiring: 'باقي {{days_left}} يوم' });
  });

  it('creates, updates and resets (null) templates', async () => {
    const prisma = makePrisma([row(1, 'expiring', 'قديم'), row(2, 'expiring', 'مكرر'), row(3, 'expired', 'منتهي')]);
    const service = new ClubWhatsAppTemplatesService(prisma as never);
    const result = await service.update(
      { templates: { expiring: 'جديد {{member_name}}', subscription: 'أهلًا {{member_name}}', expired: null } },
      9,
    );
    expect(result).toEqual({ expiring: 'جديد {{member_name}}', subscription: 'أهلًا {{member_name}}' });
    const keys = prisma.rows().map((item) => item.setting_key).sort();
    expect(keys).toEqual(['expiring', 'subscription']);
    expect(prisma.rows().find((item) => item.setting_key === 'subscription')).toMatchObject({
      category: WHATSAPP_TEMPLATE_CATEGORY,
      branch_id: null,
    });
  });

  it('rejects unknown kinds, invalid text and an empty body', async () => {
    const service = new ClubWhatsAppTemplatesService(makePrisma() as never);
    await expect(service.update({ templates: { hacked: 'x' } })).rejects.toThrow(BadRequestException);
    await expect(service.update({ templates: { expiring: '{{password}}' } })).rejects.toThrow(BadRequestException);
    await expect(service.update({ templates: {} })).rejects.toThrow(BadRequestException);
    await expect(service.update({ expiring: 'x' })).rejects.toThrow(BadRequestException);
  });
});
