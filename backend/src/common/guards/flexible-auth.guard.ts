import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { JwtUser } from '../types/jwt-user';
import { MemberJwtUser } from '../types/member-jwt-user';

function extractToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  if (req.cookies?.['one80_access']) return req.cookies['one80_access'];
  if (req.cookies?.['one80_member_access']) return req.cookies['one80_member_access'];
  return null;
}

/** Accepts staff JWT or member JWT (type=member) on shared routes like change-password. */
@Injectable()
export class FlexibleAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const token = extractToken(req);
    if (!token) throw new UnauthorizedException();

    try {
      const payload = await this.jwt.verifyAsync<JwtUser & MemberJwtUser>(token, {
        secret: this.config.get<string>('jwt.accessSecret'),
      });
      if (payload.type === 'member') {
        if (!payload.memberId) throw new UnauthorizedException();
        req.user = payload as MemberJwtUser;
      } else {
        if (payload.type != null) throw new UnauthorizedException();
        req.user = payload as JwtUser;
      }
      return true;
    } catch {
      throw new UnauthorizedException('انتهت الجلسة');
    }
  }
}
