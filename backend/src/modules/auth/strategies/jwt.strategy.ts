import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtUser } from '../../../common/types/jwt-user';
import { AuthService } from '../auth.service';
import { ACCESS_COOKIE } from '../../../common/auth/session-cookie';

function cookieExtractor(req: Request): string | null {
  if (req && req.cookies && req.cookies[ACCESS_COOKIE]) {
    return req.cookies[ACCESS_COOKIE];
  }
  return null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService, private readonly authService: AuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        cookieExtractor,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.accessSecret')!,
    });
  }

  /** Whatever this returns becomes req.user. Reject all external tokens on staff routes. */
  async validate(payload: JwtUser & { type?: string }): Promise<JwtUser> {
    if (payload.type) {
      throw new UnauthorizedException();
    }
    if (!payload.sessionId) {
      throw new UnauthorizedException('انتهت الجلسة');
    }
    // Never trust mutable authorization/scope claims from a token for its full
    // lifetime. Reload the active account so suspension, demotion, branch and
    // trainer changes take effect on the very next request.
    return this.authService.getSessionUser(payload.sub, payload.sessionId);
  }
}
