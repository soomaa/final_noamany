import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BillingPreviewQueryDto, SettleBillingStatementDto } from './dto/billing-statements.dto';

describe('hospitality settlement input validation', () => {
  it('accepts hospitality date previews without a person account', async () => {
    const dto = plainToInstance(BillingPreviewQueryDto, { accountType: 'hospitality', periodStart: '2026-09-01', periodEnd: '2026-09-13' });
    expect(await validate(dto)).toEqual([]);
  });
  it('still requires an account for employee and partner previews', async () => {
    for (const accountType of ['employee', 'partner']) {
      const dto = plainToInstance(BillingPreviewQueryDto, { accountType, periodStart: '2026-09-01', periodEnd: '2026-09-13' });
      expect((await validate(dto)).map(e => e.property)).toContain('accountId');
    }
  });
  it('requires a positive partner id when loading an account', async () => {
    for (const partnerId of [undefined, null, 0, -1, 1.5]) {
      const dto = plainToInstance(SettleBillingStatementDto, { settlementMethod: 'partner_account', partnerId });
      expect((await validate(dto)).map(e => e.property)).toContain('partnerId');
    }
    expect(await validate(plainToInstance(SettleBillingStatementDto, { settlementMethod: 'partner_account', partnerId: '3' }))).toEqual([]);
  });
});
