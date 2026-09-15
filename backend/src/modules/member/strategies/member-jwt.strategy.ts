import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { MemberJwtUser } from '../../../common/types/member-jwt-user';

function cookieExtractor(req: Request): string | null {
  if (req?.cookies?.['one80_member_access']) {
    return req.cookies['one80_member_access'];
  }
  return null;
}

@Injectable()
export class MemberJwtStrategy extends PassportStrategy(Strategy, 'member-jwt') {
  constructor(config: ConfigService, private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        cookieExtractor,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.accessSecret')!,
    });
  }

  async validate(payload: MemberJwtUser): Promise<MemberJwtUser> {
    if (payload.type !== 'member' || !payload.memberId) {
      throw new UnauthorizedException('انتهت الجلسة');
    }

    // Do not trust a structurally valid token after account deletion/deactivation.
    const [appUser, member] = await Promise.all([
      this.prisma.api_users.findUnique({
        where: { user_id: payload.sub },
        select: { status: true },
      }),
      this.prisma.club_members.findFirst({
        where: {
          id: payload.memberId,
          app_user_id: payload.sub,
          is_deleted: false,
          is_active: true,
        },
        select: { id: true },
      }),
    ]);
    if (!appUser || appUser.status !== 1 || !member) {
      throw new UnauthorizedException('انتهت الجلسة');
    }
    return payload;
  }
}
