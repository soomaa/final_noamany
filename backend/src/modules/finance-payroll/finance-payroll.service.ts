import { MonthlyPayrollEventDto, PayrollCafeChoiceDto } from '../payroll/dto/payroll.dto';
import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { JwtUser } from '../../common/types/jwt-user';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PayrollService } from '../payroll/payroll.service';
import { CreatePayrollRunDto, ListPayrollRunsDto } from '../payroll/dto/payroll.dto';
import { PermissionEngineService } from '../rbac/engine/permission-engine.service';

const actionStatuses: Record<string, readonly string[]> = {
  compute: ['draft', 'computed', 'reviewing'],
  review: ['computed'],
  approve: ['reviewing'],
  post: ['approved'],
  bank: ['posted'],
  'bank-sync': ['bank_prepared'],
};

/** Finance is another view of the HR payroll ledger, never a second salary engine. */
@Injectable()
export class FinancePayrollService {
  constructor(
    private readonly payroll: PayrollService,
    private readonly permissions: PermissionEngineService,
  ) {}

  private async requireHrPermission(user: JwtUser, action: string) {
    if (!(await this.permissions.canAny(user.sub, [`payroll.runs:${action}`]))) {
      throw new ForbiddenException('يلزم امتلاك صلاحية مسيرة الرواتب لتنفيذ هذه الخطوة');
    }
  }

  async listRuns(query: ListPayrollRunsDto, user: JwtUser) {
    await this.requireHrPermission(user, 'view');
    return this.payroll.listRuns(query, user);
  }

  async getRun(id: number, user: JwtUser) {
    await this.requireHrPermission(user, 'view');
    return this.payroll.findRun(id, user);
  }

  async listRunLines(id: number, query: PaginationDto, user: JwtUser) {
    await this.requireHrPermission(user, 'view');
    return this.payroll.listRunLines(id, query, user);
  }

  async getSlip(id: number, itemId: number, user: JwtUser) {
    await this.requireHrPermission(user, 'view');
    return this.payroll.getSlip(id, itemId, user);
  }

  async monthlyEmployee(id: number, lineId: number, user: JwtUser) {
    await this.requireHrPermission(user, 'view');
    return this.payroll.monthlyEmployee(id, lineId, user);
  }
  async addMonthlyEvent(id: number, lineId: number, dto: MonthlyPayrollEventDto, user: JwtUser) {
    await this.requireHrPermission(user, 'update');
    return this.payroll.addMonthlyEvent(id, lineId, dto, user);
  }
  async chooseMonthlyCafe(id: number, lineId: number, dto: PayrollCafeChoiceDto, user: JwtUser) {
    await this.requireHrPermission(user, 'update');
    return this.payroll.chooseMonthlyCafe(id, lineId, dto, user);
  }
  async createRun(dto: CreatePayrollRunDto, user: JwtUser) {
    await this.requireHrPermission(user, 'create');
    // The HR service enforces global scope, one run per month, and a locked period.
    return this.payroll.createRun(dto, user);
  }

  async runAction(id: number, action: string, user: JwtUser) {
    const allowedStatuses = actionStatuses[action];
    if (!allowedStatuses) throw new BadRequestException('خطوة مسيرة الرواتب غير صالحة');
    await this.requireHrPermission(user, action === 'approve' ? 'approve' : 'execute');
    const run = await this.payroll.findRun(id, user);
    if (!allowedStatuses.includes(run.status)) {
      throw new BadRequestException('تغيرت مرحلة المسيرة. حدّث البيانات قبل تنفيذ الخطوة التالية');
    }
    // Approval never pays. Posting and bank settlement retain the HR atomic claims,
    // canonical expense references and confirmed-bank-payment requirement.
    return this.payroll.runAction(id, action, user.sub, user);
  }
}
