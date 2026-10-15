import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  claimAcceptedRecruitmentApplication,
  completeRecruitmentConversion,
} from './recruitment-conversion.util';

describe('recruitment conversion transaction contract', () => {
  function db(application: Record<string, unknown> | null) {
    return {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 7 }]),
      job_request_orders: {
        findUnique: jest.fn().mockResolvedValue(application),
        update: jest.fn().mockResolvedValue({}),
      },
    };
  }

  it('claims only an accepted, unconverted application with matching identity', async () => {
    const tx = db({
      id: 7,
      pipeline_status: 'accepted',
      converted_employee_id: null,
      national_num: '29801011234567',
    });
    await expect(
      claimAcceptedRecruitmentApplication(tx as never, 7, '29801011234567'),
    ).resolves.toEqual(expect.objectContaining({ id: 7 }));
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('fails closed for an unaccepted or already converted application', async () => {
    await expect(
      claimAcceptedRecruitmentApplication(
        db({ id: 7, pipeline_status: 'offered', converted_employee_id: null }) as never,
        7,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      claimAcceptedRecruitmentApplication(
        db({ id: 7, pipeline_status: 'converted', converted_employee_id: 44 }) as never,
        7,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('marks the same application converted to the created employee', async () => {
    const tx = db({ id: 7 });
    await completeRecruitmentConversion(tx as never, 7, 44);
    expect(tx.job_request_orders.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: expect.objectContaining({
        pipeline_status: 'converted',
        converted_employee_id: 44,
      }),
    });
  });
});
