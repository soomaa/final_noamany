import { ForbiddenException, SetMetadata } from '@nestjs/common';
import { BranchScopeService } from '../branch-scope/branch-scope.service';
import { JwtUser } from '../types/jwt-user';
import { ClubBranchGroupReader } from './club-branch-group.service';

export const CLUB_GROUP_OPERATION = 'club-group-operation';
export const ClubGroupOperation = () => SetMetadata(CLUB_GROUP_OPERATION, true);

/** Group access is limited to explicitly marked refund/transfer workflows. */
export async function clubOperationBranchIds(scope: BranchScopeService, groups: Pick<ClubBranchGroupReader, 'siblingBranchIds'>, user?: JwtUser): Promise<number[] | null> {
  const allowed = scope.allowedBranchIds(user);
  if (allowed === null || allowed.length === 0) return allowed;
  const siblings = await Promise.all(allowed.map((id) => groups.siblingBranchIds(id)));
  return [...new Set([...allowed, ...siblings.flat()])];
}

export async function assertClubOperationBranch(scope: BranchScopeService, groups: Pick<ClubBranchGroupReader, 'siblingBranchIds'>, user: JwtUser | undefined, branchId: number | null | undefined) {
  const allowed = await clubOperationBranchIds(scope, groups, user);
  if (branchId == null || (allowed !== null && !allowed.includes(branchId))) {
    throw new ForbiddenException('لا تملك صلاحية الوصول لهذا الفرع أو أنه خارج مجموعة فروعك');
  }
}
