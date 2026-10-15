import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { ClubMembersService } from './club-members.service';
import { ListClubMembersDto } from './dto/list-club-members.dto';
import { ClubSubscriptionTypesService } from '../club-subscriptions/club-subscription-types.service';
import { marketingRepEmployeeWhere, marketingRepJobTitleWhere } from '../employees/marketing-rep.util';

/** This workflow never returns balances, receipts or subscription history. */
@Injectable()
export class MembershipRegistrationService {
  constructor(private readonly prisma: PrismaService, private readonly members: ClubMembersService,
    private readonly types: ClubSubscriptionTypesService, private readonly scope: BranchScopeService) {}

  private member(row: object) {
    const allowed = new Set(['id', 'memberCode', 'name', 'nameAr', 'phone', 'email', 'gender', 'cardNumber',
      'passportNumber', 'dateOfBirth', 'address', 'jobTitle', 'maritalStatus', 'branchId', 'sourceId', 'salesId',
      'employeeId', 'notes', 'emergencyName', 'emergencyPhone', 'emergencyRelation', 'guardianName', 'guardianPhone',
      'profilePicture', 'profilePhoto', 'isActive', 'createdAt']);
    return Object.fromEntries(Object.entries(row).filter(([key]) => allowed.has(key)));
  }
  async findOne(id: number, user: JwtUser) {
    return this.member(await this.members.findOne(id, user));
  }

  async packageOptions(user: JwtUser) {
    const rows = await this.types.listActive(undefined, user);
    const allowed = this.scope.allowedBranchIds(user);
    const keys = new Set(['id', 'name', 'nameAr', 'nameEn', 'price', 'days', 'branchId', 'branchIds', 'applyToAllBranches',
      'branchPrices', 'sourceSubscriptionTypeId', 'minPrice', 'isSpecialOffer', 'isLinkedToSessions', 'sessionsCount', 'sessionPrices', 'incomeType', 'benefits',
      'invitationsCount', 'inbodyCount', 'includesSpa', 'spaCount', 'isLinkedToFreeze', 'freezeDays', 'allowMultipleDailyEntries',
      'includesGymAccess', 'classTypeIds', 'classTypes', 'classSessionsCount', 'unlimitedClasses', 'attendanceCount', 'maxClassesPerDay', 'minFreeze', 'validUpgradeDuration', 'accessAreaIds', 'description', 'weekPlanner', 'offerValidity', 'isForStudents', 'isTimeBased', 'timeFrom', 'timeTo', 'packageCategory', 'packageType', 'durationValue', 'durationType', 'availabilityFrom', 'availabilityTo', 'isActive']);
    return rows.filter(row => !allowed || row.applyToAllBranches ||
      [row.branchId, ...(row.branchIds ?? [])].some(id => id != null && allowed.includes(id)))
      .map(row => {
        const option: Record<string, unknown> = Object.fromEntries(Object.entries(row).filter(([key]) => keys.has(key)));
        if (allowed && Array.isArray(option.branchPrices)) option.branchPrices = option.branchPrices.filter(price => allowed.includes(price.branchId));
        return option;
      });
  }

  async sales(user: JwtUser) {
    const jobs = await this.prisma.department_jobs.findMany({ where: marketingRepJobTitleWhere, select: { id: true } });
    const allowed = this.scope.allowedBranchIds(user);
    const rows = await this.prisma.employees.findMany({ where: { AND: [
      { OR: [{ leave_emp: null }, { leave_emp: 0 }] }, { employee_type: 1 },
      marketingRepEmployeeWhere(jobs.map(j => j.id)),
      ...(allowed ? [{ OR: [{ branch_id_fk: { in: allowed } }, { branch_id_fk: null }] }] : []) ] },
      select: { id: true, employee: true, emp_code: true, branch_id_fk: true }, orderBy: { employee: 'asc' } });
    return rows.map(row => ({ id: row.id, name: row.employee, empCode: row.emp_code, branchId: row.branch_id_fk }));
  }

  async search(search: string | undefined, user: JwtUser, branchId?: number) {
    if (!search?.trim()) return { data: [], total: 0, page: 1, pageSize: 8 };
    const query = Object.assign(new ListClubMembersDto(), { search: search.trim().slice(0, 100), page: 1, pageSize: 8, forSelect: true, ...(branchId ? { branch: String(branchId) } : {}) });
    const result = await this.members.list(query, user);
    return { data: result.data.map(row => this.member(row)), total: result.total, page: result.page, pageSize: result.pageSize };
  }

}
