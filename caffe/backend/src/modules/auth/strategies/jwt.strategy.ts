import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtUser } from '../../../common/types/jwt-user';

function cookieExtractor(req: Request): string | null {
  if (req && req.cookies && req.cookies['one80_access']) {
    return req.cookies['one80_access'];
  }
  return null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        cookieExtractor,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.accessSecret')!,
    });
  }

  /** Whatever this returns becomes req.user. Reject member-app tokens on staff routes. */
  async validate(payload: JwtUser & { type?: string }): Promise<JwtUser> {
    if (payload.type === 'member') {
      throw new UnauthorizedException();
    }
    return payload;
  }
}
