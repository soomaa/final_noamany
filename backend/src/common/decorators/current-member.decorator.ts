import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { MemberJwtUser } from '../types/member-jwt-user';

export const CurrentMember = createParamDecorator(
  (
    data: keyof MemberJwtUser | undefined,
    ctx: ExecutionContext,
  ): MemberJwtUser | MemberJwtUser[keyof MemberJwtUser] => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as MemberJwtUser;
    return data ? user?.[data] : user;
  },
);
