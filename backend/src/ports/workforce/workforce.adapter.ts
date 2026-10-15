export const WORKFORCE_ADAPTER = Symbol('WORKFORCE_ADAPTER');

export interface WorkforceIdentityExtension {
  providerRecordId: number | null;
}

export interface WorkforceAdapter {
  identityForEmployee(employeeId: number): Promise<WorkforceIdentityExtension>;
  employeeFormFields(employeeId: number): Promise<Record<string, string>>;
  syncEmployee(employeeId: number, fields: Record<string, unknown>): Promise<void>;
  syncAllEmployees(): Promise<void>;
}

export class DisabledWorkforceAdapter implements WorkforceAdapter {
  async identityForEmployee(_employeeId: number): Promise<WorkforceIdentityExtension> {
    return { providerRecordId: null };
  }

  async employeeFormFields(_employeeId: number): Promise<Record<string, string>> {
    return {};
  }

  async syncEmployee(_employeeId: number, _fields: Record<string, unknown>): Promise<void> {}

  async syncAllEmployees(): Promise<void> {}
}
