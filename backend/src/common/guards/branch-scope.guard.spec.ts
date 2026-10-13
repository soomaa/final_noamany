import { ForbiddenException } from "@nestjs/common";
import { BranchScopeService } from "../branch-scope/branch-scope.service";
import { BranchScopeGuard } from "./branch-scope.guard";

describe("BranchScopeGuard strict isolation", () => {
  const guard = new BranchScopeGuard(new BranchScopeService());

  const context = (request: Record<string, unknown>) =>
    ({
      switchToHttp: () => ({ getRequest: () => request }),
    }) as never;

  it("allows public routes without an authenticated staff user", async () => {
    await expect(guard.canActivate(context({ query: {}, body: {} }))).resolves.toBe(true);
  });

  it("allows a super-admin to target any branch", async () => {
    await expect(
      guard.canActivate(
        context({
          user: { level: 1, branch: 0 },
          query: { branchId: "9" },
          body: {},
        }),
      ),
    ).resolves.toBe(true);
  });

  it("allows a non-admin to target only their exact branch", async () => {
    await expect(
      guard.canActivate(
        context({
          user: { level: 2, branch: 2 },
          query: {},
          body: { branchId: 2 },
        }),
      ),
    ).resolves.toBe(true);
  });

  it("rejects a foreign branch even if it was previously a fanout child", async () => {
    await expect(
      guard.canActivate(
        context({
          user: { level: 2, branch: 2 },
          query: { branchId: 5 },
          body: {},
        }),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it("rejects an unassigned non-admin before the request reaches a service", async () => {
    await expect(
      guard.canActivate(
        context({ user: { level: 2, branch: 0 }, query: {}, body: {} }),
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});
