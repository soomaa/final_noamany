import { isMarketingRepJobTitle, marketingRepEmployeeWhere } from "./marketing-rep.util";

describe("sales-specialist job-title matching", () => {
  it.each(["sales", "Sales Specialist", "SALES REPRESENTATIVE"])(
    "recognizes the imported English sales title %s",
    (title) => {
      expect(isMarketingRepJobTitle(title)).toBe(true);
    },
  );

  it.each([
    "سيلز",
    "سيلز مان",
    "اخصائي مبيعات",
    "مسؤول مبيعات",
    "مسئول مبيعات",
    "مندوب مبيعات",
  ])("recognizes the active Arabic sales title %s", (title) => {
    expect(isMarketingRepJobTitle(title)).toBe(true);
  });

  it("does not treat a sales manager as a personal sales specialist", () => {
    expect(isMarketingRepJobTitle("Sales Manager")).toBe(false);
  });

  it.each(["مدير مبيعات", "رئيس قسم المبيعات", "مشرف مبيعات"])(
    "does not treat the management title %s as a personal sales specialist",
    (title) => {
      expect(isMarketingRepJobTitle(title)).toBe(false);
    },
  );

  it("includes employees explicitly assigned the additional sales responsibility", () => {
    expect(marketingRepEmployeeWhere([])).toEqual(
      expect.objectContaining({ OR: expect.arrayContaining([{ is_sales: true }]) }),
    );
  });
});
