import { ServiceUnavailableException } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FailClosedHrLedgerAdapter } from './accounting/hr-ledger.adapter';
import { HrFileCategoryAdapter } from './files/file-category.adapter';
import { DisabledGymIncentiveAdapter } from './payroll/gym-incentive.adapter';
import { DisabledWorkforceAdapter } from './workforce/workforce.adapter';

describe('portable HR adapter contracts', () => {
  it('runs optional workforce and incentive defaults without a host database client', async () => {
    const workforce = new DisabledWorkforceAdapter();
    const incentives = new DisabledGymIncentiveAdapter();

    await expect(workforce.identityForEmployee(17)).resolves.toEqual({ providerRecordId: null });
    await expect(workforce.employeeFormFields(17)).resolves.toEqual({});
    await expect(workforce.syncEmployee(17, {})).resolves.toBeUndefined();
    await expect(incentives.calculate({ employeeId: 17, employeeCode: 4401, fromDate: '2026-08-01', toDate: '2026-08-31' })).resolves.toBe(0);
  });

  it('fails closed before financial workflow mutation when no ledger is installed', async () => {
    const ledger = new FailClosedHrLedgerAdapter();
    await expect(ledger.ensureReady()).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(ledger.getPayrollReconciliation({ payrollNumber: 10 })).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('exposes only HR file categories in the portable registry', () => {
    const categories = new HrFileCategoryAdapter();
    expect(categories.policy('emp-photo')).not.toBeNull();
    expect(categories.policy('document')).not.toBeNull();
    expect(categories.policy('product-image')).toBeNull();
    expect(categories.policy('storage-doc')).toBeNull();
  });

  it('keeps staff authentication core independent from host customer identity', () => {
    const coreFiles = [
      'src/modules/auth/auth.module.ts',
      'src/modules/auth/auth.service.ts',
      'src/modules/auth/auth.controller.ts',
      'src/common/guards/flexible-auth.guard.ts',
    ];
    const source = coreFiles
      .map((file) => readFileSync(resolve(__dirname, '..', file.replace(/^src\//, '')), 'utf8'))
      .join('\n');

    expect(source).not.toMatch(/modules\/member|\.\.\/member|member-auth\.service|MemberAuthService|MemberJwtUser/);
  });

  it('keeps accounting delegates behind the ledger adapter', () => {
    const source = readFileSync(resolve(__dirname, '../modules/payroll/payroll.service.ts'), 'utf8');
    expect(source).not.toMatch(/acc_default_accounts|acc_journal_entries/);
  });
});
