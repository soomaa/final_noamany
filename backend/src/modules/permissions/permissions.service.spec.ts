import { BadRequestException } from '@nestjs/common';
import { PermissionsService } from './permissions.service';

describe('PermissionsService action', () => {
  it('rejects an old workflow state with a clear client error', async () => {
    const prisma: any = {
      hr_all_ozonat_orders: {
        findUnique: jest.fn().mockResolvedValue({
          id: 15,
          current_to_user_id: 1,
          actions_sends: 'progress',
        }),
      },
    };
    const service = new PermissionsService(prisma);

    await expect(service.action(15, { action: 'accept' }, 1)).rejects.toThrow(
      new BadRequestException('هذا الإذن ليس ضمن مسار الاعتماد الجديد'),
    );
  });

  it.each([
    ['accept', 'approve_hr', 'approve_moder_3am', 4, 'approved'],
    ['reject', 'send_to_direct_manager', 'approve_direct_manager', 2, 'rejected'],
  ] as const)(
    'processes a new workflow request when the recipient chooses %s',
    async (action, currentState, expectedStage, expectedSuspend, expectedStatus) => {
      const prisma = {
        hr_all_ozonat_orders: {
          findUnique: jest.fn().mockResolvedValue({
            id: 16,
            current_to_user_id: 1,
            actions_sends: currentState,
            publisher: 1,
            emp_id_fk: null,
            ezn_rkm: 16,
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        users: { findUnique: jest.fn().mockResolvedValue(null) },
        hr_all_ozonat_history: {
          aggregate: jest.fn().mockResolvedValue({ _max: { id: 10 } }),
          create: jest.fn().mockResolvedValue({}),
        },
      };
      const service = new PermissionsService(prisma as never);

      await expect(service.action(16, { action }, 1, 'مدير')).resolves.toEqual({
        id: 16,
        stage: expectedStage,
        suspend: expectedSuspend,
        status: expectedStatus,
      });
      expect(prisma.hr_all_ozonat_orders.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 16 } }),
      );
    },
  );
});
