import { UserAdminService } from './user-admin.service';

describe('UserAdminService session revocation', () => {
  function makeService() {
    const tx = {
      users: { update: jest.fn().mockResolvedValue({ user_id: 9, approved: 0, branch_id_fk: 2 }) },
      staff_auth_sessions: {},
      business_audit_log: {},
    };
    const prisma = {
      users: {
        findUnique: jest.fn().mockResolvedValue({
          user_id: 9,
          level: 2,
          approved: 1,
          branch_id_fk: 2,
        }),
      },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const permissions = { invalidateUser: jest.fn() };
    const sessions = { revokeAllForUser: jest.fn() };
    const audit = { log: jest.fn() };
    const service = new UserAdminService(
      prisma as never,
      { get: jest.fn() } as never,
      permissions as never,
      sessions as never,
      audit as never,
    );
    return { service, prisma, tx, sessions, audit };
  }

  it('suspends the account, revokes sessions, and writes audit in one transaction', async () => {
    const { service, tx, sessions, audit } = makeService();

    await service.updateStatus(9, { approved: 0 }, 1);

    expect(sessions.revokeAllForUser).toHaveBeenCalledWith(9, 'user_suspended', tx);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 9,
        action: 'system_user.suspended',
        actorUserId: 1,
      }),
      tx,
    );
  });

  it('supports an audited emergency revocation without disabling the account', async () => {
    const { service, tx, sessions, audit } = makeService();

    await expect(service.revokeSessions(9, 'lost device', 1)).resolves.toEqual({
      userId: 9,
      revoked: true,
    });

    expect(sessions.revokeAllForUser).toHaveBeenCalledWith(9, 'emergency:lost device', tx);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'staff_session.emergency_revoked',
        reason: 'lost device',
      }),
      tx,
    );
    expect(tx.users.update).not.toHaveBeenCalled();
  });
});
