import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';

/** Portal access always means the signed-in coach, including manager-coaches. */
@Injectable()
export class TrainerTrainingGuard implements CanActivate {
  constructor(private readonly db: PrismaService) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<{user: JwtUser}>();
    const user = req.user;
    const employeeId = user?.employeeId ?? user?.emp_code;
    if (!user?.is_trainer || !user.trainer_id || !employeeId)
      throw new ForbiddenException('حسابك غير مرتبط بمدرب نشط');
    const trainer = await this.db.club_trainers.findFirst({where: {
      id: user.trainer_id, employee_id: employeeId, is_active: true, is_deleted: false,
    }, select: {id: true}});
    if (!trainer) throw new ForbiddenException('حسابك غير مرتبط بمدرب نشط');
    req.user = {...user, level: 2};
    return true;
  }
}
