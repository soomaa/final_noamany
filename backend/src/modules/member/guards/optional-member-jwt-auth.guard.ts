import { ExecutionContext, Injectable } from '@nestjs/common';
import { MemberJwtAuthGuard } from './member-jwt-auth.guard';

/**
 * Populates request.user when a member token is supplied, but also permits
 * guests so public catalogue routes can use a manually selected branch.
 */
@Injectable()
export class OptionalMemberJwtAuthGuard extends MemberJwtAuthGuard {
  override canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{ headers?: { authorization?: string }; cookies?: Record<string, unknown> }>();
    const hasBearerToken = typeof request.headers?.authorization === 'string'
      && request.headers.authorization.trim().length > 0;
    const hasMemberCookie = Boolean(request.cookies?.one80_member_access);
    return hasBearerToken || hasMemberCookie ? super.canActivate(context) : true;
  }
}
