/** JWT claims for gym member mobile app (api_users + club_members). */
export interface MemberJwtUser {
  sub: number;
  memberId: number;
  branchId: number;
  phone: string;
  name: string | null;
  type: 'member';
}

export interface MemberLoginResult {
  accessToken: string;
  refreshToken: string;
  user: MemberJwtUser;
  message: string;
  /** True while the member is still on the shared default password (000000).
   *  The mobile app must force a password change before allowing any other action. */
  mustChangePassword: boolean;
}
