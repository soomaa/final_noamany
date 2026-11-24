import 'reflect-metadata';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { CreateExitDto } from './dto/exit.dto';
import { computeNoticeShortfall, daysBetween } from './exit-types';
import { ExitsService } from './exits.service';

describe('computeNoticeShortfall', () => {
  it('no shortfall when a full month of notice was served', () => {
    const r = computeNoticeShortfall({
      exitType: 'resignation',
      noticeGivenDate: '2026-10-01',
      lastWorkingDate: '2026-10-31',
      requiredNoticeDays: 30,
    });
    expect(r).toEqual({ noticeDaysGiven: 30, shortfallDays: 0, suggestedType: null });
  });

  it('partial notice → shortfall and resignation is flagged as abandonment', () => {
    const r = computeNoticeShortfall({
      exitType: 'resignation',
      noticeGivenDate: '2026-11-20',
      lastWorkingDate: '2026-11-24',
      requiredNoticeDays: 30,
    });
    expect(r).toEqual({ noticeDaysGiven: 4, shortfallDays: 26, suggestedType: 'abandonment' });
  });

  it('no notice at all → the whole period is missing', () => {
    const r = computeNoticeShortfall({ exitType: 'abandonment', lastWorkingDate: '2026-11-24', requiredNoticeDays: 30 });
    expect(r).toEqual({ noticeDaysGiven: null, shortfallDays: 30, suggestedType: null });
  });

  it('short-notice resignation keeps its type (no suggestion) but reports the shortfall', () => {
    const r = computeNoticeShortfall({
      exitType: 'resignation_short_notice',
      noticeGivenDate: '2026-11-14',
      lastWorkingDate: '2026-11-24',
      requiredNoticeDays: 30,
    });
    expect(r.shortfallDays).toBe(20);
    expect(r.suggestedType).toBeNull();
  });

  it('company-side exits owe no employee notice', () => {
    for (const exitType of ['termination', 'contract_end'] as const) {
      expect(computeNoticeShortfall({ exitType, lastWorkingDate: '2026-11-24', requiredNoticeDays: 30 }).shortfallDays).toBe(0);
    }
  });

  it('respects a configured notice period and never goes negative', () => {
    expect(
      computeNoticeShortfall({ exitType: 'resignation', noticeGivenDate: '2026-09-01', lastWorkingDate: '2026-11-24', requiredNoticeDays: 60 })
        .shortfallDays,
    ).toBe(0);
    expect(
      computeNoticeShortfall({ exitType: 'resignation', noticeGivenDate: '2026-11-10', lastWorkingDate: '2026-11-24', requiredNoticeDays: 15 })
        .shortfallDays,
    ).toBe(1);
  });

  it('counts calendar days across a DST change', () => {
    expect(daysBetween('2026-03-25', '2026-04-05')).toBe(11);
  });
});

describe('ExitsService.create', () => {
  const admin = { sub: 5, emp_code: 1 } as JwtUser;

  function setup(employee: unknown = { id: 42 }) {
    const executeRaw = jest.fn().mockResolvedValue(1);
    const queryRaw = jest.fn().mockResolvedValue([{ id: BigInt(9) }]);
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = { $executeRaw: executeRaw, $queryRaw: queryRaw, employees: { updateMany } };
    const prisma = {
      employees: {
        findUnique: jest.fn().mockImplementation(({ select }: { select?: Record<string, boolean> }) =>
          // trainer sync reads leave_emp/mosma_wazefy_code; return null there to keep it a no-op
          select && 'leave_emp' in select ? null : employee,
        ),
        findMany: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const scope = { allowedBranchIds: jest.fn().mockReturnValue(null) };
    const service = new ExitsService(prisma as unknown as PrismaService, scope as unknown as BranchScopeService);
    return { service, prisma, executeRaw, updateMany };
  }

  it('records an abandonment, computes the shortfall and sets the legacy leave fields', async () => {
    const { service, executeRaw, updateMany } = setup();
    const res = await service.create(
      { empId: 42, exitType: 'abandonment', lastWorkingDate: '2026-11-24', reason: 'ساب الشغل فجأة' },
      admin,
    );
    expect(res).toMatchObject({ id: 9, empId: 42, exitType: 'abandonment', noticeShortfallDays: 30, requiredNoticeDays: 30 });
    const insert = executeRaw.mock.calls[0][0];
    expect(insert.sql).toContain('INSERT INTO hr_employee_exits');
    expect(insert.values).toEqual(
      expect.arrayContaining([42, 'abandonment', null, '2026-11-24', 30, 30, 'ساب الشغل فجأة', 5]),
    );
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 42 },
      data: {
        leave_emp: 1,
        end_service_date_m: '2026-11-24',
        end_date: '2026-11-24',
        reason: 'ترك العمل / إخلال طرف — ساب الشغل فجأة',
      },
    });
  });

  it('warns when a "resignation" was recorded without a full month of notice', async () => {
    const { service } = setup();
    const res = await service.create(
      { empId: 42, exitType: 'resignation', noticeGivenDate: '2026-11-20', lastWorkingDate: '2026-11-24' },
      admin,
    );
    expect(res.noticeShortfallDays).toBe(26);
    expect(res.suggestedType).toBe('abandonment');
    expect(res.warning).toContain('ترك العمل / إخلال طرف');
  });

  it('rejects a notice date after the last working day', async () => {
    const { service, prisma } = setup();
    await expect(
      service.create({ empId: 42, exitType: 'resignation', noticeGivenDate: '2026-12-01', lastWorkingDate: '2026-11-24' }, admin),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('404s for an unknown employee', async () => {
    const { service } = setup(null);
    await expect(
      service.create({ empId: 1, exitType: 'termination', lastWorkingDate: '2026-11-24' }, admin),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('DTO rejects an unknown exit type and a malformed date', async () => {
    const dto = plainToInstance(CreateExitDto, { empId: 1, exitType: 'fired', lastWorkingDate: '24/11/2026' });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property).sort()).toEqual(['exitType', 'lastWorkingDate']);
  });
});
