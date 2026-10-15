import { UnauthorizedException } from '@nestjs/common';

export const EXTERNAL_IDENTITY_ADAPTER = Symbol('EXTERNAL_IDENTITY_ADAPTER');

export interface ExternalIdentityClaims {
  sub: number;
  type: string;
}

export interface ExternalIdentityLoginResult {
  accessToken: string;
  refreshToken: string;
  user: ExternalIdentityClaims;
  message: string;
  accountType: string;
  mustChangePassword: boolean;
  exposeTokensInBody: true;
  requiresBranchSelection?: false;
}

/**
 * The identity matched several accounts (e.g. one gym member enrolled in several branches):
 * no session is opened yet. The client must show the picker and exchange `selectionToken`
 * with the provider's own selection endpoint. No tokens or cookies are issued.
 */
export interface ExternalIdentitySelectionResult {
  requiresBranchSelection: true;
  selectionToken: string;
  branches: unknown[];
  message: string;
  accountType: string;
}

export interface ExternalIdentityRefreshResult {
  accessToken: string;
  refreshToken: string;
  user: ExternalIdentityClaims;
}

/** Optional customer/consumer identity owned by the host application. */
export interface ExternalIdentityAdapter {
  login(
    username: string,
    password: string,
  ): Promise<ExternalIdentityLoginResult | ExternalIdentitySelectionResult>;
  /** Return null when the token is not owned by this provider; otherwise validate with the provider's own trust configuration. */
  validateAccessToken(token: string): Promise<ExternalIdentityClaims | null>;
  /** Return null when the refresh token is not owned by this provider. */
  refresh(refreshToken: string): Promise<ExternalIdentityRefreshResult | null>;
  supportsClaims(claims: unknown): claims is ExternalIdentityClaims;
  /** `claims` are the caller's verified token claims, for providers that link several accounts. */
  changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
    claims?: ExternalIdentityClaims,
  ): Promise<{ message: string }>;
}

/** Portable HR defaults to staff-only authentication and fails closed on fallback. */
export class DisabledExternalIdentityAdapter implements ExternalIdentityAdapter {
  async login(): Promise<ExternalIdentityLoginResult> {
    throw new UnauthorizedException('لا يمكنك الدخول هناك بيان خاطىء');
  }

  async validateAccessToken(): Promise<ExternalIdentityClaims | null> {
    return null;
  }

  async refresh(): Promise<ExternalIdentityRefreshResult | null> {
    return null;
  }

  supportsClaims(_claims: unknown): _claims is ExternalIdentityClaims {
    return false;
  }

  async changePassword(): Promise<{ message: string }> {
    throw new UnauthorizedException('انتهت الجلسة');
  }
}
