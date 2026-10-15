import { buildMemberProfileSummary } from "./club-member-profile-summary";

describe("buildMemberProfileSummary", () => {
  it("counts distinct attendance days separately from entry count for each subscription", () => {
    const result = buildMemberProfileSummary({
      today: "2026-08-21",
      subscriptions: [
        {
          id: 11,
          subscription_number: "A000306-1",
          subscription_type: "one80 1 month",
          status: "active",
          subscription_start_date: "2026-08-01",
          subscription_end_date: "2026-08-31",
          is_linked_to_sessions: true,
          sessions_count: 30,
          sessions_used: 10,
        },
      ],
      attendances: [
        {
          id: 1,
          subscription_id: 11,
          attendance_date: "2026-08-10",
          check_in_time: new Date("2026-08-10T08:00:00Z"),
          check_out_time: new Date("2026-08-10T09:00:00Z"),
          duration: 60,
          status: "checked_out",
        },
        {
          id: 2,
          subscription_id: 11,
          attendance_date: "2026-08-10",
          check_in_time: new Date("2026-08-10T18:00:00Z"),
          check_out_time: new Date("2026-08-10T19:00:00Z"),
          duration: 60,
          status: "checked_out",
        },
        {
          id: 3,
          subscription_id: 11,
          attendance_date: "2026-08-20",
          check_in_time: new Date("2026-08-20T10:00:00Z"),
          check_out_time: null,
          duration: null,
          status: "checked_in",
        },
      ],
      renewalSubscriptionIds: new Set([11]),
      renewalCount: 1,
    });

    expect(result.totals).toEqual({
      subscriptions: 1,
      renewals: 1,
      attendanceDays: 2,
      attendanceEntries: 3,
      lastAttendanceDate: "2026-08-20",
    });
    expect(result.subscriptions[0]).toEqual(
      expect.objectContaining({
        id: 11,
        totalDays: 30,
        elapsedDays: 20,
        remainingDays: 10,
        attendanceDays: 2,
        attendanceEntries: 3,
        sessionsUsed: 10,
        sessionsRemaining: 20,
        attendanceRate: 33,
        isRenewal: true,
      }),
    );
  });

  it("computes attendanceRate from sessions used for session-linked subscriptions, and from attendance days over elapsed days otherwise", () => {
    const result = buildMemberProfileSummary({
      today: "2026-08-11",
      subscriptions: [
        {
          id: 50,
          subscription_number: "A000500-1",
          subscription_type: "one80 1 month",
          status: "active",
          subscription_start_date: "2026-08-01",
          subscription_end_date: "2026-08-31",
          is_linked_to_sessions: false,
          sessions_count: null,
          sessions_used: 0,
        },
      ],
      attendances: [
        {
          id: 1,
          subscription_id: 50,
          attendance_date: "2026-08-05",
          check_in_time: new Date("2026-08-05T08:00:00Z"),
          check_out_time: null,
          duration: null,
          status: "checked_out",
        },
      ],
      renewalSubscriptionIds: new Set(),
      renewalCount: 0,
    });

    // elapsedDays = 10 (2026-08-01 -> 2026-08-11), 1 attendance day -> 10%
    expect(result.subscriptions[0]).toEqual(
      expect.objectContaining({ elapsedDays: 10, attendanceDays: 1, attendanceRate: 10 }),
    );
  });

  it("does not penalize a subscription that just started (uses elapsed, not total, days as the denominator)", () => {
    const result = buildMemberProfileSummary({
      today: "2026-08-02",
      subscriptions: [
        {
          id: 51,
          subscription_number: "A000501-1",
          subscription_type: "one80 1 month",
          status: "active",
          subscription_start_date: "2026-08-01",
          subscription_end_date: "2026-08-31",
          is_linked_to_sessions: false,
          sessions_count: null,
          sessions_used: 0,
        },
      ],
      attendances: [
        {
          id: 1,
          subscription_id: 51,
          attendance_date: "2026-08-01",
          check_in_time: new Date("2026-08-01T08:00:00Z"),
          check_out_time: null,
          duration: null,
          status: "checked_out",
        },
      ],
      renewalSubscriptionIds: new Set(),
      renewalCount: 0,
    });

    // Only 1 day has elapsed since the subscription started, so the rate is judged against
    // that single day (100%) rather than the full 30-day plan (~3%).
    expect(result.subscriptions[0]).toEqual(
      expect.objectContaining({ elapsedDays: 1, attendanceDays: 1, attendanceRate: 100 }),
    );
  });

  it("derives expiration from dates and exhausted sessions instead of trusting stored status", () => {
    const result = buildMemberProfileSummary({
      today: "2026-08-21",
      subscriptions: [
        {
          id: 12,
          subscription_number: "A000306-2",
          subscription_type: "old plan",
          status: "active",
          subscription_start_date: "2026-07-01",
          subscription_end_date: "2026-07-31",
          is_linked_to_sessions: false,
          sessions_count: null,
          sessions_used: 0,
        },
        {
          id: 13,
          subscription_number: "A000306-3",
          subscription_type: "sessions plan",
          status: "active",
          subscription_start_date: "2026-08-01",
          subscription_end_date: "2026-09-01",
          is_linked_to_sessions: true,
          sessions_count: 10,
          sessions_used: 10,
        },
      ],
      attendances: [],
      renewalSubscriptionIds: new Set(),
      renewalCount: 0,
    });

    expect(
      result.subscriptions.map((subscription) => subscription.status),
    ).toEqual(["expired", "expired"]);
  });

  it("hides expired renewal siblings when an active period of the same plan exists", () => {
    const result = buildMemberProfileSummary({
      today: "2026-08-21",
      subscriptions: [
        {
          id: 40,
          subscription_number: "A000100-4",
          subscription_type: "one year family rate",
          subscription_type_id: 7,
          status: "active",
          subscription_start_date: "2026-08-21",
          subscription_end_date: "2027-08-20",
          is_linked_to_sessions: true,
          sessions_count: 12,
          sessions_used: 0,
        },
        {
          id: 30,
          subscription_number: "A000100-3",
          subscription_type: "one year family rate",
          subscription_type_id: 7,
          status: "expired",
          subscription_start_date: "2025-08-21",
          subscription_end_date: "2026-08-20",
          is_linked_to_sessions: true,
          sessions_count: 12,
          sessions_used: 0,
        },
        {
          id: 20,
          subscription_number: "A000100-2",
          subscription_type: "one year family rate",
          subscription_type_id: 7,
          status: "frozen",
          subscription_start_date: "2024-08-21",
          subscription_end_date: "2025-08-20",
          is_linked_to_sessions: true,
          sessions_count: 12,
          sessions_used: 0,
        },
        {
          id: 10,
          subscription_number: "A000100-1",
          subscription_type: "one year family rate",
          subscription_type_id: 7,
          status: "expired",
          subscription_start_date: "2023-08-21",
          subscription_end_date: "2024-08-20",
          is_linked_to_sessions: true,
          sessions_count: 12,
          sessions_used: 0,
        },
      ],
      attendances: [],
      renewalSubscriptionIds: new Set([40, 30, 20]),
      renewalCount: 3,
    });

    expect(result.totals.subscriptions).toBe(4);
    expect(result.subscriptions.map((subscription) => subscription.id)).toEqual([40]);
    expect(result.subscriptions.map((subscription) => subscription.status)).toEqual([
      "active",
    ]);
  });
});
