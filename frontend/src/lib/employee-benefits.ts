export interface EmployeeBenefits {
  date: string; enabled: boolean; limit: number; used: number; remaining: number;
  eligibleProductIds: number[]; discountEnabled: boolean;
}
export function employeeCartBenefits(items: { cafeProductId: number; quantity: number; unitPrice: number }[], benefits?: EmployeeBenefits) {
  let remaining = benefits?.enabled ? benefits.remaining : 0;
  const quantities = items.map((item) => {
    const count = benefits?.eligibleProductIds.includes(item.cafeProductId) ? Math.min(remaining, Math.floor(item.quantity)) : 0;
    remaining -= count;
    return count;
  });
  return { quantities, count: quantities.reduce((sum, n) => sum + n, 0), amount: Math.round(items.reduce((sum, item, index) => sum + item.unitPrice * quantities[index], 0) * 100) / 100 };
}
