import { ClubMembersService } from "./club-members.service";

describe("ClubMembersService profile summary", () => {
  it("returns branch-scoped subscription, renewal, and attendance totals for one member", async () => {
    const member = {
      id: 5,
      member_code: "A000306",
      name: "Abdullah Mohamed",
      phone: "01000000000",
      email: null,
      gender: "male",
      card_number: null,
      date_of_birth: null,
      address: null,
      marital_status: null,
      job_title: null,
      profile_picture: null,
      branch_id: 2,
      membership_type_id: null,
      start_date: "2026-08-01",
      end_date: "2026-08-31",
      notes: null,
      is_active: true,
      is_blocked: false,
      block_reason: null,
      blocked_at: null,
      blocked_by: null,
      sales_id: null,
      employee_id: null,
      guardian_name: null,
      guardian_phone: null,
      created_by: 30,
      app_user_id: null,
      created_at: new Date("2026-08-01T08:00:00Z"),
      updated_at: new Date("2026-08-20T08:00:00Z"),
      membership_type: null,
    };
    const subscriptions = [
      {
        id: 11,
        subscription_number: "A000306-1",
        subscription_type: "one80 1 month",
        status: "active",
        subscription_start_date: "2026-08-01",
        subscription_end_date: "2026-08-31",
        is_linked_to_sessions: false,
        sessions_count: null,
        sessions_used: 0,
      },
    ];
    const attendances = [
      {
        id: 21,
        subscription_id: 11,
        attendance_date: "2026-08-20",
        check_in_time: new Date("2026-08-20T08:00:00Z"),
        check_out_time: new Date("2026-08-20T09:00:00Z"),
        duration: 60,
        status: "checked_out",
      },
    ];
    const prisma = {
      club_members: { findFirst: jest.fn().mockResolvedValue(member) },
      club_subscriptions: {
        findMany: jest.fn().mockResolvedValue(subscriptions),
      },
      club_attendance: { findMany: jest.fn().mockResolvedValue(attendances) },
      club_locker_handoffs: { findMany: jest.fn().mockResolvedValue([]) },
      business_audit_log: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ entity_id: "11" }, { entity_id: "11" }]),
      },
    };
    const branchScope = { isBranchAllowed: jest.fn().mockReturnValue(true) };
    const service = new ClubMembersService(
      prisma as never,
      { log: jest.fn() } as never,
      branchScope as never,
      {} as never,
    );

    const result = await service.profileSummary(5, {
      sub: 30,
      level: 2,
      branch: 2,
      name: "الاستقبال",
    } as never);

    expect(branchScope.isBranchAllowed).toHaveBeenCalledWith(
      expect.anything(),
      2,
    );
    expect(prisma.business_audit_log.findMany).toHaveBeenCalledWith({
      where: {
        entity_type: "club_subscription",
        action: "renew",
        entity_id: { in: ["11"] },
      },
      select: { entity_id: true },
    });
    expect(prisma.club_subscriptions.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { member_id: 5, branch_id: 2 } }),
    );
    expect(prisma.club_attendance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { member_id: 5, branch_id: 2 } }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        member: expect.objectContaining({ id: 5, memberCode: "A000306" }),
        totals: expect.objectContaining({
          subscriptions: 1,
          renewals: 2,
          attendanceDays: 1,
          attendanceEntries: 1,
        }),
      }),
    );
  });

  it("stops before reading subscriptions or attendance when branch access is denied", async () => {
    const prisma = {
      club_members: {
        findFirst: jest.fn().mockResolvedValue({ id: 5, branch_id: 2 }),
      },
      club_subscriptions: { findMany: jest.fn() },
      club_attendance: { findMany: jest.fn() },
      business_audit_log: { findMany: jest.fn() },
    };
    const service = new ClubMembersService(
      prisma as never,
      { log: jest.fn() } as never,
      { isBranchAllowed: jest.fn().mockReturnValue(false) } as never,
      {} as never,
    );

    await expect(
      service.profileSummary(5, {
        sub: 30,
        level: 2,
        branch: 1,
        name: "فرع آخر",
      } as never),
    ).rejects.toThrow("لا تملك صلاحية الوصول لبيانات هذا الفرع");
    expect(prisma.club_subscriptions.findMany).not.toHaveBeenCalled();
    expect(prisma.club_attendance.findMany).not.toHaveBeenCalled();
    expect(prisma.business_audit_log.findMany).not.toHaveBeenCalled();
  });
});
