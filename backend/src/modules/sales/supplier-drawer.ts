import { Prisma, ShiftSessionStatus } from "@prisma/client";
import { toDecimal, toNumber } from "./sales.utils";

/** Drawer movement for cash handed to (or refunded by) a supplier from the cashier's drawer. */
export const SUPPLIER_DRAWER_MOVEMENT = "supplier_payment";

const reference = (paymentNumber: string) => `SUP-${paymentNumber}`;

/**
 * Takes a cash supplier payment out of the paying user's own open shift drawer, so the shift's
 * expected cash matches what is really left in the drawer. A user without an open shift paid from
 * somewhere else (the safe, the bank), so nothing is recorded. The journal entry is posted by the
 * supplier payment itself; this only moves the drawer balance.
 */
export async function takeSupplierPaymentFromDrawer(
  tx: Prisma.TransactionClient,
  input: {
    branchId: number;
    userId: number;
    paymentNumber: string;
    amount: number;
    description: string;
    refund?: boolean;
  },
) {
  const amount = Math.round(input.amount * 100) / 100;
  if (amount <= 0) return null;
  const session = await tx.sales_shift_sessions.findFirst({
    where: { branch_id: input.branchId, user_id: input.userId, status: ShiftSessionStatus.open },
    orderBy: { id: "desc" },
  });
  if (!session) return null;
  const direction = input.refund ? "in" : "out";
  await tx.sales_cash_drawer_transactions.create({
    data: {
      reference: reference(input.paymentNumber),
      branch_id: session.branch_id,
      shift_session_id: session.id,
      movement_type: SUPPLIER_DRAWER_MOVEMENT,
      direction,
      amount: toDecimal(amount),
      category: "supplier",
      description: input.description,
      created_by: input.userId,
    },
  });
  await tx.sales_shift_sessions.update({
    where: { id: session.id },
    data: {
      expected_closing_balance: input.refund ? { increment: toDecimal(amount) } : { decrement: toDecimal(amount) },
    },
  });
  return session.id;
}

/**
 * Undoes the drawer side of voided supplier payments. While the shift is still open the movement is
 * simply cancelled; once it is closed the cash goes back into the user's current open drawer, if any.
 */
export async function returnSupplierPaymentsToDrawer(
  tx: Prisma.TransactionClient,
  paymentNumbers: string[],
  userId: number,
) {
  if (!paymentNumbers.length) return;
  const rows = await tx.sales_cash_drawer_transactions.findMany({
    where: {
      reference: { in: paymentNumbers.map(reference) },
      movement_type: SUPPLIER_DRAWER_MOVEMENT,
      status: "posted",
    },
    include: { session: { select: { status: true } } },
  });
  for (const row of rows) {
    const amount = toNumber(row.amount);
    const back = row.direction === "out" ? { increment: toDecimal(amount) } : { decrement: toDecimal(amount) };
    if (row.session.status === ShiftSessionStatus.open) {
      await tx.sales_cash_drawer_transactions.update({ where: { id: row.id }, data: { status: "cancelled" } });
      await tx.sales_shift_sessions.update({
        where: { id: row.shift_session_id },
        data: { expected_closing_balance: back },
      });
      continue;
    }
    if (!row.branch_id) continue;
    const session = await tx.sales_shift_sessions.findFirst({
      where: { branch_id: row.branch_id, user_id: userId, status: ShiftSessionStatus.open },
      orderBy: { id: "desc" },
    });
    if (!session) continue;
    await tx.sales_cash_drawer_transactions.create({
      data: {
        reference: `${row.reference}-R`,
        branch_id: session.branch_id,
        shift_session_id: session.id,
        source_transaction_id: row.id,
        movement_type: SUPPLIER_DRAWER_MOVEMENT,
        direction: row.direction === "out" ? "in" : "out",
        amount: row.amount,
        category: "supplier",
        description: `إلغاء ${row.description ?? row.reference}`,
        created_by: userId,
      },
    });
    await tx.sales_shift_sessions.update({ where: { id: session.id }, data: { expected_closing_balance: back } });
  }
}
