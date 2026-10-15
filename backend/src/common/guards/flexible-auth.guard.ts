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
import { AuthService } from '../../modules/auth/auth.service';
import { Inject, Optional } from '@nestjs/common';
import {
  DisabledExternalIdentityAdapter,
  EXTERNAL_IDENTITY_ADAPTER,
  ExternalIdentityAdapter,
} from '../../ports/identity/external-identity.adapter';
import { ACCESS_COOKIE } from '../auth/session-cookie';

function extractToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  if (req.cookies?.[ACCESS_COOKIE]) return req.cookies[ACCESS_COOKIE];
  return null;
}

/** Accepts staff JWT or an optional host identity on shared routes. */
@Injectable()
export class FlexibleAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly auth: AuthService,
    @Optional() @Inject(EXTERNAL_IDENTITY_ADAPTER)
    private readonly externalIdentity: ExternalIdentityAdapter = new DisabledExternalIdentityAdapter(),
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const token = extractToken(req);
    if (!token) throw new UnauthorizedException();

    try {
      const externalClaims = await this.externalIdentity.validateAccessToken(token);
      if (externalClaims) {
        req.user = externalClaims;
        return true;
      }
      const payload = await this.jwt.verifyAsync<JwtUser>(token, {
        secret: this.config.get<string>('jwt.accessSecret'),
      });
      if (!payload.sessionId) throw new UnauthorizedException();
      req.user = await this.auth.getSessionUser(payload.sub, payload.sessionId);
      return true;
    } catch {
      throw new UnauthorizedException('انتهت الجلسة');
    }
  }
}
