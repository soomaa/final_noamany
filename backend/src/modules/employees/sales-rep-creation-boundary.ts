import { isMarketingRepJobTitle } from './marketing-rep.util';

export function salesRepCreationBoundary(input: { employeeId: number | null; jobTitle: string | null }) {
  if (input.employeeId == null) return { canConfigureSales: false, reason: 'employee_required' as const };
  if (!isMarketingRepJobTitle(input.jobTitle)) return { canConfigureSales: false, reason: 'sales_job_required' as const };
  return { canConfigureSales: true, reason: null };
}
