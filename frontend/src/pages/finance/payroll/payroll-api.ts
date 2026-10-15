import { api } from '@/lib/api';
import type { PaginatedResponse } from '@/components/common/data-table';
import type { AddMonthlyEvent, MonthlyCafeChoice, MonthlyEmployee, PayrollAction, PayrollActionResult, PayrollLine, PayrollRun, PayrollSlip } from './types';

const root = '/finance/payroll';
export const payrollApi = {
  async list(params: { page: number; pageSize: number; status?: string }) {
    return (await api.get<PaginatedResponse<PayrollRun>>(root, { params })).data;
  },
  async get(id: number) { return (await api.get<PayrollRun>(`${root}/${id}`)).data; },
  async lines(id: number, params: { page: number; pageSize: number; search?: string }) {
    return (await api.get<PaginatedResponse<PayrollLine>>(`${root}/${id}/lines`, { params })).data;
  },
  async slip(id: number, itemId: number) { return (await api.get<PayrollSlip>(`${root}/${id}/items/${itemId}`)).data; },
  async monthly(id: number, itemId: number) { return (await api.get<MonthlyEmployee>(`${root}/${id}/items/${itemId}/monthly`)).data; },
  async event(id: number, itemId: number, input: AddMonthlyEvent) { return (await api.post<MonthlyEmployee>(`${root}/${id}/items/${itemId}/events`, input)).data; },
  async cafe(id: number, itemId: number, input: MonthlyCafeChoice) { return (await api.post<MonthlyEmployee>(`${root}/${id}/items/${itemId}/cafe`, input)).data; },
  async create(input: { month: number; year: number; payoutDate?: string }) { return (await api.post<PayrollRun>(root, input)).data; },
  async action(id: number, action: PayrollAction) { return (await api.post<PayrollActionResult>(`${root}/${id}/${action}`)).data; },
};
