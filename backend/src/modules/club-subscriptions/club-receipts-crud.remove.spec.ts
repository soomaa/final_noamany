import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { ClubReceiptsCrudService } from './club-receipts-crud.service';
import { ClubReceiptsService } from './club-receipts.service';
import { ClubSubscriptionAccountingService } from './club-subscription-accounting.service';

// Keep the actor complete: even a system admin must not be able to delete a posted receipt.
const admin: JwtUser = {
  sub: 1,
  level: 1,
  emp_code: 1,
  branch: 0,
  branch_name: null,
  man_women_type: 0,
  name: 'Admin',
  image: null,
  job_title: null,
  is_trainer: false,
  trainer_id: null,
};

describe('ClubReceiptsCrudService.remove', () => {
  it('rejects deletion without changing the receipt, ledger, or linked subscription', async () => {
    const prisma = {
      $transaction: jest.fn(),
    };
    const accounting = { reverseReceiptEntry: jest.fn() };
    const service = new ClubReceiptsCrudService(
      prisma as unknown as PrismaService,
      {} as ClubReceiptsService,
      accounting as unknown as ClubSubscriptionAccountingService,
      {} as BranchScopeService,
    );
    await expect(service.remove(9, admin)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(accounting.reverseReceiptEntry).not.toHaveBeenCalled();
  });
});
