import { BadRequestException, Logger } from '@nestjs/common';
import { ClubQuickServicesService } from './club-quick-services.service';

const user = { sub: 9, emp_code: 77, branch: 1, name: 'موظف الاستقبال' } as never;

function buildService(createsSalesLead = true) {
  const prisma = {
    club_quick_services: {
      findFirst: jest.fn().mockResolvedValue({
        id: 10,
        name: 'حصة فردية',
        description: null,
        price: 100,
        branch_id: 1,
        sort_order: 1,
        is_active: true,
        creates_sales_lead: createsSalesLead,
        created_at: new Date('2026-08-01T08:00:00Z'),
        updated_at: new Date('2026-08-01T08:00:00Z'),
      }),
    },
    club_members: { findFirst: jest.fn() },
  };
  const receipts = {
    create: jest.fn().mockResolvedValue({
      id: 4,
      receiptNumber: 'R-104',
      amount: 100,
      payments: [{ method: 'cash', amount: 100 }],
    }),
  };
  const branchScope = { isBranchAllowed: jest.fn().mockReturnValue(true) };
  const leads = { recordQuickSaleCustomer: jest.fn().mockResolvedValue({ id: 15, created: true }) };
  return {
    service: new ClubQuickServicesService(
      prisma as never,
      receipts as never,
      branchScope as never,
      leads as never,
    ),
    receipts,
    leads,
  };
}

describe('club quick-service CRM capture', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('requires a valid phone for an anonymous lead-enabled sale', async () => {
    const { service, receipts } = buildService();

    await expect(service.sell({
      serviceId: 10,
      memberName: 'فاطمة',
      branchId: 1,
      paymentMethod: 'cash',
    }, user)).rejects.toBeInstanceOf(BadRequestException);

    expect(receipts.create).not.toHaveBeenCalled();
  });

  it('captures the posted walk-in sale using branch plus normalized phone identity', async () => {
    const { service, leads } = buildService();

    await expect(service.sell({
      serviceId: 10,
      memberName: 'فاطمة',
      customerPhone: '٠١٠ ١٢٣٤ ٥٦٧٨',
      branchId: 1,
      paymentMethod: 'cash',
    }, user)).resolves.toMatchObject({ leadCaptured: true });

    expect(leads.recordQuickSaleCustomer).toHaveBeenCalledWith({
      fullName: 'فاطمة',
      phone: '01012345678',
      serviceName: 'حصة فردية',
      branchId: 1,
      receiptNumber: 'R-104',
    }, user);
  });

  it('keeps the committed sale successful when CRM synchronization fails', async () => {
    const { service, leads } = buildService();
    leads.recordQuickSaleCustomer.mockRejectedValue(new Error('temporary CRM failure'));

    await expect(service.sell({
      serviceId: 10,
      memberName: 'فاطمة',
      customerPhone: '01012345678',
      branchId: 1,
      paymentMethod: 'cash',
    }, user)).resolves.toMatchObject({ leadCaptured: false });
  });

  it('does not require a phone or call CRM when lead capture is disabled', async () => {
    const { service, leads, receipts } = buildService(false);

    await expect(service.sell({
      serviceId: 10,
      branchId: 1,
      paymentMethod: 'cash',
    }, user)).resolves.toMatchObject({ leadCaptured: false });

    expect(receipts.create).toHaveBeenCalledTimes(1);
    expect(leads.recordQuickSaleCustomer).not.toHaveBeenCalled();
  });
});
