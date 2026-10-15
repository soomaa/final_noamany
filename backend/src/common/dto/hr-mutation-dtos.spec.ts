import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateDocumentDto } from '../../modules/documents/dto/document.dto';
import { CreateFormSettingDto } from '../../modules/forms-settings/dto/form-setting.dto';
import { CreateLeaveTypeDto } from '../../modules/leaves/dto/leave-type.dto';
import { CreateLoanAccountDto } from '../../modules/loan-settings/dto/loan-setting.dto';
import { CreateSalaryScaleDto } from '../../modules/salary-scale/dto/salary-scale.dto';
import { CreateWeeklyLeaveDto } from '../../modules/weekly-leaves/dto/weekly-leave.dto';

async function errorsFor<T extends object>(type: new () => T, payload: object) {
  return validate(plainToInstance(type, payload), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
}

describe('HR mutation DTO runtime contracts', () => {
  it('rejects an unknown field instead of letting it reach Prisma', async () => {
    const errors = await errorsFor(CreateDocumentDto, {
      empId: 3,
      title: 'هوية',
      injectedColumn: 'admin',
    });
    expect(errors.some((error) => error.property === 'injectedColumn')).toBe(true);
  });

  it('rejects empty labels and non-positive employee identifiers', async () => {
    await expect(errorsFor(CreateWeeklyLeaveDto, { empId: 0, offDay: '' })).resolves.not.toHaveLength(0);
    await expect(errorsFor(CreateFormSettingDto, { title: '', type: 1 })).resolves.not.toHaveLength(0);
    await expect(errorsFor(CreateLeaveTypeDto, { title: '', maxDays: -1 })).resolves.not.toHaveLength(0);
  });

  it('rejects negative salary values and non-numeric loan accounts', async () => {
    await expect(errorsFor(CreateSalaryScaleDto, {
      mo2hel: 'جامعي',
      martba: 'أ',
      dawamType: 'full-time',
      salaryStart: -1,
      yearBonusValue: 100,
    })).resolves.not.toHaveLength(0);
    await expect(errorsFor(CreateLoanAccountDto, {
      empId: 1,
      accountNumber: '12A',
      accountName: 'سلفة',
    })).resolves.not.toHaveLength(0);
  });
});
