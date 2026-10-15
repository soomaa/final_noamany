import { aggregateLateRows } from "./late-report.util";

describe("aggregateLateRows", () => {
  it("splits late minutes by approved permission date and ignores invalid/zero rows", () => {
    const result = aggregateLateRows(
      [
        { memberCode: 10, actionDate: "2026-08-01", lateMin: 15 },
        { memberCode: 10, actionDate: "2026-08-02", lateMin: 20.9 },
        { memberCode: 10, actionDate: "2026-08-03", lateMin: 0 },
        { memberCode: 11, actionDate: null, lateMin: 7 },
      ],
      new Set(["10:2026-08-01"]),
    );

    expect(result.get(10)).toEqual({
      withPermission: 15,
      withoutPermission: 20,
    });
    expect(result.get(11)).toEqual({ withPermission: 0, withoutPermission: 7 });
  });

  it("does not merge permissions belonging to another employee", () => {
    const result = aggregateLateRows(
      [{ memberCode: 12, actionDate: "2026-08-01", lateMin: 9 }],
      new Set(["13:2026-08-01"]),
    );

    expect(result.get(12)).toEqual({ withPermission: 0, withoutPermission: 9 });
  });
});
