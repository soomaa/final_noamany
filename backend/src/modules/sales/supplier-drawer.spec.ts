import { ShiftSessionStatus } from "@prisma/client";
import { returnSupplierPaymentsToDrawer, takeSupplierPaymentFromDrawer } from "./supplier-drawer";

function fakeTx(sessions: Array<{ id: number; branch_id: number; user_id: number; status: ShiftSessionStatus }>) {
  const movements: Array<Record<string, any>> = [];
  const tx = {
    sales_shift_sessions: {
      findFirst: jest.fn(async ({ where }: any) =>
        sessions.find((s) => s.branch_id === where.branch_id && s.user_id === where.user_id && s.status === where.status) ?? null),
      update: jest.fn(async () => ({})),
    },
    sales_cash_drawer_transactions: {
      create: jest.fn(async ({ data }: any) => {
        const row = { id: movements.length + 1, status: "posted", ...data };
        movements.push(row);
        return row;
      }),
      findMany: jest.fn(async ({ where }: any) =>
        movements
          .filter((m) => where.reference.in.includes(m.reference) && m.status === where.status)
          .map((m) => ({ ...m, session: { status: sessions.find((s) => s.id === m.shift_session_id)!.status } }))),
      update: jest.fn(async ({ where, data }: any) => Object.assign(movements.find((m) => m.id === where.id)!, data)),
    },
  };
  return { tx: tx as never, raw: tx, movements };
}

describe("supplier cash payments and the shift drawer", () => {
  it("takes cash out of the payer's own open shift", async () => {
    const { tx, raw, movements } = fakeTx([{ id: 7, branch_id: 3, user_id: 50, status: ShiftSessionStatus.open }]);
    const sessionId = await takeSupplierPaymentFromDrawer(tx, { branchId: 3, userId: 50, paymentNumber: "PAY-000010", amount: 250, description: "سداد" });
    expect(sessionId).toBe(7);
    expect(movements[0]).toMatchObject({ reference: "SUP-PAY-000010", shift_session_id: 7, movement_type: "supplier_payment", direction: "out" });
    expect(raw.sales_shift_sessions.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { expected_closing_balance: { decrement: expect.anything() } } });
  });

  it("records nothing when the payer has no open shift (paid from the safe or bank)", async () => {
    const { tx, movements } = fakeTx([{ id: 7, branch_id: 3, user_id: 99, status: ShiftSessionStatus.open }]);
    expect(await takeSupplierPaymentFromDrawer(tx, { branchId: 3, userId: 50, paymentNumber: "PAY-1", amount: 100, description: "x" })).toBeNull();
    expect(movements).toHaveLength(0);
  });

  it("cancels the movement of a voided payment while the shift is open", async () => {
    const { tx, raw, movements } = fakeTx([{ id: 7, branch_id: 3, user_id: 50, status: ShiftSessionStatus.open }]);
    await takeSupplierPaymentFromDrawer(tx, { branchId: 3, userId: 50, paymentNumber: "PAY-2", amount: 80, description: "x" });
    await returnSupplierPaymentsToDrawer(tx, ["PAY-2"], 50);
    expect(movements[0].status).toBe("cancelled");
    expect(raw.sales_shift_sessions.update).toHaveBeenLastCalledWith({ where: { id: 7 }, data: { expected_closing_balance: { increment: expect.anything() } } });
  });

  it("puts the cash back into the current drawer once the original shift is closed", async () => {
    const sessions = [
      { id: 7, branch_id: 3, user_id: 50, status: ShiftSessionStatus.open as ShiftSessionStatus },
      { id: 8, branch_id: 3, user_id: 50, status: ShiftSessionStatus.closed as ShiftSessionStatus },
    ];
    const { tx, movements } = fakeTx(sessions);
    await takeSupplierPaymentFromDrawer(tx, { branchId: 3, userId: 50, paymentNumber: "PAY-3", amount: 40, description: "x" });
    sessions[0].status = ShiftSessionStatus.closed;
    sessions[1].status = ShiftSessionStatus.open;
    await returnSupplierPaymentsToDrawer(tx, ["PAY-3"], 50);
    expect(movements[0].status).toBe("posted");
    expect(movements[1]).toMatchObject({ reference: "SUP-PAY-3-R", shift_session_id: 8, direction: "in", source_transaction_id: 1 });
  });
});
