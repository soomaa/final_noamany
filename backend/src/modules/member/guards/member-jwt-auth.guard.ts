import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';

/** Validates member JWT (type=member). Use on routes marked @Public() to bypass staff JwtAuthGuard. */
@Injectable()
export class MemberJwtAuthGuard extends AuthGuard('member-jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!isPublic) return super.canActivate(context);
    // Route is @Public for staff guard but still requires member auth when this guard is applied.
    return super.canActivate(context);
  }
}
