export interface MemberNotificationDraft {
  title: string;
  body: string;
  target: 'all' | 'branch';
  branchId: string;
  appUsersOnly: boolean;
}

export interface MemberNotificationRequest {
  title: string;
  body: string;
  type: 'offer';
  broadcast: true;
  appUsersOnly: boolean;
  branchId?: number;
}

export function buildMemberNotificationRequest(
  draft: MemberNotificationDraft,
): MemberNotificationRequest {
  const title = draft.title.trim();
  const body = draft.body.trim();
  if (!title || !body) throw new Error('Title and body are required');

  const parsedBranchId = Number(draft.branchId);
  if (draft.target === 'branch' && (!Number.isInteger(parsedBranchId) || parsedBranchId <= 0)) {
    throw new Error('A valid branch is required');
  }

  return {
    title,
    body,
    type: 'offer',
    broadcast: true,
    appUsersOnly: draft.appUsersOnly,
    ...(draft.target === 'branch' ? { branchId: parsedBranchId } : {}),
  };
}
