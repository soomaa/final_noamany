import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";

export function toNumber(
  v: Prisma.Decimal | number | null | undefined,
): number {
  if (v == null) return 0;
  return typeof v === "number" ? v : Number(v);
}

export function notDeletedFilter(): { is_deleted: false } {
  return { is_deleted: false };
}

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export const EXPENSE_APPROVED = "موافق عليه";
export const REVENUE_PAID = "مدفوع";

export function plExpenseWhere(
  extra?: Prisma.fin_expensesWhereInput,
): Prisma.fin_expensesWhereInput {
  return { ...notDeletedFilter(), approval_status: EXPENSE_APPROVED, ...extra };
}

export function plRevenueWhere(
  extra?: Prisma.fin_revenuesWhereInput,
): Prisma.fin_revenuesWhereInput {
  return { ...notDeletedFilter(), payment_status: REVENUE_PAID, ...extra };
}

export function computeExpenseTotal(amount: number, taxAmount: number) {
  const amt = roundMoney(amount);
  const tax = roundMoney(taxAmount);
  return { amount: amt, taxAmount: tax, totalAmount: roundMoney(amt + tax) };
}

export function computeRevenueAmounts(
  amount: number,
  taxAmount: number,
  discountAmount: number,
) {
  const amt = roundMoney(amount);
  const tax = roundMoney(taxAmount);
  const discount = roundMoney(discountAmount);
  const totalAmount = roundMoney(amt + tax);
  const netAmount = roundMoney(totalAmount - discount);
  return {
    amount: amt,
    taxAmount: tax,
    discountAmount: discount,
    totalAmount,
    netAmount,
  };
}

/** Transaction-safe EXP-YYYY-###### / REV-YYYY-###### document numbers. */
export async function nextFinDocNumber(
  prisma: PrismaService | Prisma.TransactionClient,
  table: "fin_expenses" | "fin_revenues",
  column: "expense_number" | "revenue_number",
  prefix: "EXP" | "REV",
): Promise<string> {
  const year = new Date().getFullYear();
  const fullPrefix = `${prefix}-${year}`;
  const lockKey = `seq:${table}:${column}:${fullPrefix}`;
  await prisma.$queryRawUnsafe("SELECT GET_LOCK(?, 10)", lockKey);
  try {
    // A second raw aggregate after an INSERT in the same MySQL interactive transaction can fail
    // with Prisma P2010. Fixed-width numeric suffixes sort lexicographically, so reading the latest
    // document through Prisma is both portable and includes earlier uncommitted rows in this tx.
    const lastNumber =
      table === "fin_expenses"
        ? (
            await prisma.fin_expenses.findFirst({
              where: { expense_number: { startsWith: `${fullPrefix}-` } },
              orderBy: { expense_number: "desc" },
              select: { expense_number: true },
            })
          )?.expense_number
        : (
            await prisma.fin_revenues.findFirst({
              where: { revenue_number: { startsWith: `${fullPrefix}-` } },
              orderBy: { revenue_number: "desc" },
              select: { revenue_number: true },
            })
          )?.revenue_number;
    const last = lastNumber
      ? Number(lastNumber.slice(fullPrefix.length + 1))
      : 0;
    const next = (Number.isFinite(last) ? last : 0) + 1;
    return `${fullPrefix}-${String(next).padStart(6, "0")}`;
  } finally {
    await prisma.$queryRawUnsafe("SELECT RELEASE_LOCK(?)", lockKey);
  }
}

const PAYMENT_METHOD_AR: Record<string, string> = {
  cash: "نقدي",
  card: "بطاقة",
  wallet: "محفظة",
  transfer: "تحويل بنكي",
  bank: "حساب بنكي",
  online: "إلكتروني",
  visa: "فيزا",
  instapay: "إنستا باي",
  mixed: "مختلط",
};

export function mapPaymentMethodToArabic(
  method: string | null | undefined,
): string {
  if (!method) return "نقدي";
  return PAYMENT_METHOD_AR[method] ?? method;
}

export function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}
