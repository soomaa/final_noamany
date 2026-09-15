import { DeferredCafePayrollAllocationAdapter } from './cafe-payroll-allocation.adapter';

it('fails closed by reporting no payroll allocation until a Noamany payroll bridge is configured', async () => {
  const adapter = new DeferredCafePayrollAllocationAdapter();

  await expect(adapter.isSaleAllocated(42)).resolves.toBe(false);
});
