import { QuickSalesService } from './quick-sales.service';

describe('saved employee invoice identity', () => {
  function setup() {
    const employeeLookup = jest.fn().mockResolvedValue([{ id: 7, employee: 'كريم أحمد' }]);
    const sale = { id: 1, sale_type: 'employee', employee_id: 7, customer_name: 'عميل نقدي', branch_id: 1,
      employee_free_drinks: 1, subtotal: 75, discount_amount: 75, total_amount: 0,
      items: [{ name: 'كورتادو', quantity: 1, unit_price: 75, line_total: 75, free_quantity: 1 }], payments: [], events: [] };
    const prisma = { employees: { findMany: employeeLookup }, sales_quick_sales: { findUnique: jest.fn().mockResolvedValue(sale) } };
    const service = new QuickSalesService(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never,
      { isBranchAllowed: () => true } as never, {} as never, {} as never);
    return { service, sale, employeeLookup };
  }

  it('resolves the employee on an old free invoice without changing historical prices', async () => {
    const { service } = setup();
    const invoice = await service.findOne(1);
    expect(invoice).toMatchObject({ customerName: 'كريم أحمد', employeeName: 'كريم أحمد', saleType: 'employee',
      subtotal: 75, discountAmount: 75, totalAmount: 0, employeeFreeDrinks: 1,
      items: [expect.objectContaining({ freeQuantity: 1, unitPrice: 75, lineTotal: 75 })] });
  });

  it('preserves the employee name saved at checkout even after a rename', async () => {
    const { service, sale } = setup();
    sale.customer_name = 'كريم وقت البيع';
    expect(await service.findOne(1)).toMatchObject({ employeeName: 'كريم وقت البيع', customerName: 'كريم وقت البيع' });
  });

  it('batches legacy names and never labels a customer invoice as an employee invoice', async () => {
    const { service, sale, employeeLookup } = setup();
    const rows = await (service as any).mapSales([sale, { ...sale, id: 2 }, { ...sale, id: 3, sale_type: 'customer', employee_id: null }]);
    expect(employeeLookup).toHaveBeenCalledTimes(1);
    expect(employeeLookup).toHaveBeenCalledWith({ where: { id: { in: [7] } }, select: { id: true, employee: true } });
    expect(rows[2]).toMatchObject({ customerName: 'عميل نقدي', employeeName: null });
  });

  it('keeps a missing former employee identifiable by id', async () => {
    const { service, employeeLookup } = setup();
    employeeLookup.mockResolvedValue([]);
    expect(await service.findOne(1)).toMatchObject({ customerName: 'موظف #7', employeeName: 'موظف #7' });
  });
});
