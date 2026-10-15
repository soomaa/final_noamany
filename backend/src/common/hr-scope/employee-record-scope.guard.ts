import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtUser } from '../types/jwt-user';
import { HrDataScopeService } from './hr-data-scope.service';

@Injectable()
export class EmployeeRecordScopeGuard implements CanActivate {
  constructor(
    private readonly scope: HrDataScopeService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      user?: JwtUser;
      params?: Record<string, string>;
    }>();
    const rawId = request.params?.id;
    if (rawId == null) return true;
    const employeeId = Number(rawId);
    if (!Number.isInteger(employeeId) || employeeId <= 0 || !request.user) {
      throw new ForbiddenException('لا تملك صلاحية الوصول إلى بيانات هذا الموظف');
    }
    const allowed = await this.scope.employeeWhere(request.user);
    const count = await this.prisma.employees.count({
      where: { AND: [{ id: employeeId }, allowed] },
    });
    if (count !== 1) {
      throw new ForbiddenException('لا تملك صلاحية الوصول إلى بيانات هذا الموظف');
    }
    return true;
  }
}
