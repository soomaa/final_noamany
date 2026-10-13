import { Prisma } from "@prisma/client";

/**
 * The legacy employees table contains imported enum values that Prisma cannot always
 * deserialize. Workflow code must explicitly select only the scalar fields it uses.
 */
export const EMPLOYEE_WORKFLOW_SELECT = {
  id: true,
  emp_code: true,
  employee: true,
  manger: true,
  edara_id: true,
  edara_n: true,
  qsm_id: true,
  qsm_n: true,
  mosma_wazefy_n: true,
  emp_type: true,
  start_work_date_m: true,
} satisfies Prisma.employeesSelect;

export type WorkflowEmployee = Prisma.employeesGetPayload<{
  select: typeof EMPLOYEE_WORKFLOW_SELECT;
}>;
