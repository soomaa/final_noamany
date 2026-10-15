/** JWT claims for gym member mobile app (api_users + club_members). */
export interface MemberJwtUser {
  sub: number;
  memberId: number;
  branchId: number;
  memberCode: string;
  phone: string;
  name: string | null;
  type: 'member';
  /**
   * Memberships (one per branch) this person proved with their password at login.
   * Present only when there is more than one: the app may switch between them
   * without asking for the password again. Every switch re-validates the target.
   */
  linkedMemberIds?: number[];
}

export interface MemberLoginResult {
  accessToken: string;
  refreshToken: string;
  user: MemberJwtUser;
  message: string;
  /** True while the member is still on the shared default password (000000).
   *  The mobile app must force a password change before allowing any other action. */
  mustChangePassword: boolean;
  requiresBranchSelection?: false;
}

/** One membership offered on the branch picker. */
export interface MemberBranchOption {
  memberId: number;
  branchId: number;
  branchName: string;
  memberCode: string;
  standing: 'active' | 'frozen' | 'upcoming' | 'expired' | 'none';
  /** End date (YYYY-MM-DD) of the period behind `standing`; null when there is none. */
  endsAt: string | null;
  /** Set on the in-app switcher: the membership the current session is on. */
  current?: boolean;
}

/**
 * The password matched memberships in several branches: no session yet. The app shows
 * the picker and exchanges `selectionToken` + the chosen `memberId` for tokens at
 * `POST /member/auth/select-branch`.
 */
export interface MemberBranchSelectionResult {
  requiresBranchSelection: true;
  selectionToken: string;
  branches: MemberBranchOption[];
  message: string;
}

export type MemberLoginOutcome = MemberLoginResult | MemberBranchSelectionResult;
