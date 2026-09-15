import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

export type PortalCustomerClaims = {
  sub: number;
  type: 'portal-customer';
  name: string;
  phone: string;
};

@Injectable()
export class PortalCustomerGuard implements CanActivate {
  constructor(private readonly jwt: JwtService, private readonly config: ConfigService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request & { user?: PortalCustomerClaims }>();
    const authorization = request.headers.authorization;
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
    if (!token) throw new UnauthorizedException('يرجى تسجيل الدخول أولاً');

    try {
      const payload = await this.jwt.verifyAsync<PortalCustomerClaims>(token, {
        secret: this.config.get<string>('jwt.accessSecret'),
      });
      if (payload.type !== 'portal-customer' || !payload.sub) throw new Error('invalid audience');
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('انتهت جلسة حساب المتجر، يرجى تسجيل الدخول مرة أخرى');
    }
  }
}
