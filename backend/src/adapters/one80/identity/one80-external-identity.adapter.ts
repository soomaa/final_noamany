import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { MemberAuthService } from '../../../modules/member/member-auth.service';
import {
  ExternalIdentityAdapter,
  ExternalIdentityClaims,
  ExternalIdentityLoginResult,
  ExternalIdentitySelectionResult,
} from '../../../ports/identity/external-identity.adapter';

@Injectable()
export class One80ExternalIdentityAdapter implements ExternalIdentityAdapter {
  constructor(
    private readonly memberAuth: MemberAuthService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(
    username: string,
    password: string,
  ): Promise<ExternalIdentityLoginResult | ExternalIdentitySelectionResult> {
    const result = await this.memberAuth.login(username, password);
    // Several branches accepted the password: hand the picker to the client unchanged.
    if (result.requiresBranchSelection) {
      return { ...result, accountType: 'member' };
    }
    return {
      ...result,
      user: result.user,
      accountType: 'member',
      exposeTokensInBody: true,
    };
  }

  supportsClaims(claims: unknown): claims is ExternalIdentityClaims {
    if (!claims || typeof claims !== 'object') return false;
    const value = claims as Record<string, unknown>;
    return value.type === 'member' && Number.isInteger(value.sub) && Number.isInteger(value.memberId);
  }

  async validateAccessToken(token: string): Promise<ExternalIdentityClaims | null> {
    const decoded = this.jwt.decode(token);
    if (!this.supportsClaims(decoded)) return null;
    const claims = await this.jwt.verifyAsync(token, {
      secret: this.config.get<string>('jwt.accessSecret'),
    });
    return this.supportsClaims(claims) ? claims : null;
  }

  async refresh(refreshToken: string) {
    const decoded = this.jwt.decode(refreshToken) as Record<string, unknown> | null;
    if (decoded?.type !== 'member') return null;
    return this.memberAuth.refresh(refreshToken);
  }

  changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
    claims?: ExternalIdentityClaims,
  ) {
    // A member who proved several branch accounts at login keeps one password across them.
    const linked = (claims as { linkedMemberIds?: unknown } | undefined)?.linkedMemberIds;
    const linkedMemberIds = Array.isArray(linked)
      ? linked.map(Number).filter((id) => Number.isInteger(id) && id > 0)
      : [];
    return this.memberAuth.changePassword(userId, currentPassword, newPassword, linkedMemberIds);
  }
}
