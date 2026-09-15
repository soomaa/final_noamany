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

/** Accept the token aliases used by older Flutter network layers. */
function legacyMobileExtractor(req: Request): string | null {
  const body = req?.body as Record<string, unknown> | undefined;
  const query = req?.query as Record<string, unknown> | undefined;
  const value = body?.access_token ?? body?.token ?? query?.access_token ?? query?.token;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        cookieExtractor,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        legacyMobileExtractor,
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.accessSecret')!,
    });
  }

  /** Whatever this returns becomes req.user. Staff tokens have no customer audience. */
  async validate(payload: JwtUser & { type?: string }): Promise<JwtUser> {
    if (payload.type != null) {
      throw new UnauthorizedException();
    }
    return payload;
  }
}
