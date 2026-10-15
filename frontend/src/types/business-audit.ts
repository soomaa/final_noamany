export interface BusinessAuditEntry {
  id: number;
  entityType: string;
  entityId: string;
  action: string;
  actorUserId: number | null;
  actorName: string | null;
  branchId?: number | null;
  before: unknown;
  after: unknown;
  changedFields?: string[] | null;
  reason?: string | null;
  correlationId?: string | null;
  createdAt: string;
}
