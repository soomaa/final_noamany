import { Prisma, PrismaClient } from '@prisma/client';
import {
  cleanText,
  employeeSourceKey,
  normalizeText,
} from './employee-migration.shared';

export interface LegacyUser {
  user_id: number;
  agent_brok_fk: number | null;
  emp_code: number | null;
  username: string | null;
  password: string | null;
  name: string | null;
  email: string | null;
  address: string | null;
  level: number | null;
  role_id_fk: number | null;
  image: string | null;
  x_y_z: string | null;
  approved: 'active' | 'notactive' | null;
  branch_id_fk: number | null;
}

export interface UserTransformContext {
  employeeByLegacyId: Map<number, EmployeeReference>;
  employeeByBusinessCode: Map<number, EmployeeReference>;
  branchByLegacyId: Map<number, number>;
}

interface EmployeeReference {
  newEmployeeId: number;
  employeeName: string | null;
  branchId: number | null;
}

export interface TransformedUser {
  data: Prisma.usersUncheckedCreateInput;
  warnings: string[];
}

export async function readLegacyUsers(legacy: PrismaClient): Promise<LegacyUser[]> {
  return legacy.$queryRaw<LegacyUser[]>`
    SELECT
      user_id, agent_brok_fk, emp_code, username, password, name, email,
      address, level, role_id_fk, image, x_y_z, approved, branch_id_fk
    FROM users
    ORDER BY user_id ASC
  `;
}

export function normalizeUsername(value: string | null): string {
  return String(value ?? '').trim().toLocaleLowerCase('en-US');
}

export function validateLegacyUsers(rows: LegacyUser[]): void {
  const ids = new Set<number>();
  const usernames = new Map<string, number>();
  for (const row of rows) {
    if (!Number.isInteger(row.user_id) || row.user_id <= 0) {
      throw new Error(`Invalid legacy user ID: ${row.user_id}`);
    }
    if (ids.has(row.user_id)) throw new Error(`Duplicate legacy user ID: ${row.user_id}`);
    ids.add(row.user_id);
    const username = normalizeUsername(row.username);
    if (!username) throw new Error(`Empty username for legacy user ${row.user_id}`);
    if (username.length > 40) throw new Error(`Username exceeds 40 characters: ${row.username}`);
    const duplicateId = usernames.get(username);
    if (duplicateId != null) {
      throw new Error(
        `Duplicate legacy username after trimming: "${row.username}" (users ${duplicateId}, ${row.user_id})`,
      );
    }
    usernames.set(username, row.user_id);
  }
}

export async function buildUserTransformContext(
  target: PrismaClient | Prisma.TransactionClient,
  sourceKey: string,
): Promise<UserTransformContext> {
  const [employeeMappings, branchMappings] = await Promise.all([
    target.legacy_employee_mappings.findMany({
      where: { source_key: sourceKey },
      include: {
        employee: {
          select: { employee: true, branch_id_fk: true },
        },
      },
    }),
    target.legacy_branch_mappings.findMany({
      where: { source_key: sourceKey },
      select: { legacy_id: true, new_branch_id: true },
    }),
  ]);
  return {
    employeeByLegacyId: new Map(
      employeeMappings.map((item) => [
        item.legacy_id,
        {
          newEmployeeId: item.new_employee_id,
          employeeName: item.employee?.employee ?? null,
          branchId: item.employee?.branch_id_fk ?? null,
        },
      ]),
    ),
    employeeByBusinessCode: new Map(
      employeeMappings.flatMap((item) =>
        item.source_emp_code == null
          ? []
          : [[
              item.source_emp_code,
              {
                newEmployeeId: item.new_employee_id,
                employeeName: item.employee?.employee ?? null,
                branchId: item.employee?.branch_id_fk ?? null,
              },
            ] as const],
      ),
    ),
    branchByLegacyId: new Map(
      branchMappings.map((item) => [item.legacy_id, item.new_branch_id]),
    ),
  };
}

function namesReferToSamePerson(left: string | null, right: string | null): boolean {
  const a = normalizeText(left ?? '');
  const b = normalizeText(right ?? '');
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const aWords = new Set(a.split(' '));
  const bWords = new Set(b.split(' '));
  const common = [...aWords].filter((word) => bWords.has(word)).length;
  return common / Math.min(aWords.size, bWords.size) >= 0.75;
}

export function transformUser(
  row: LegacyUser,
  context: UserTransformContext,
): TransformedUser {
  const warnings: string[] = [];
  const username = String(row.username ?? '').trim();
  if (!username) throw new Error(`Empty username for legacy user ${row.user_id}`);

  let employeeId: number | null = null;
  let targetBranchId: number | null = null;
  let approved = row.approved === 'active' ? 1 : 0;
  if (row.emp_code != null && row.emp_code > 0) {
    const byLegacyId = context.employeeByLegacyId.get(row.emp_code);
    const byBusinessCode = context.employeeByBusinessCode.get(row.emp_code);
    const sourceName = cleanText(row.name, 100);
    const employee = namesReferToSamePerson(sourceName, byLegacyId?.employeeName ?? null)
      ? byLegacyId
      : namesReferToSamePerson(sourceName, byBusinessCode?.employeeName ?? null)
        ? byBusinessCode
        : undefined;
    if (!employee) {
      warnings.push(
        `legacy=${row.user_id}: employee reference ${row.emp_code} does not match the account name; account disabled and left unlinked`,
      );
      approved = 0;
    } else {
      employeeId = employee.newEmployeeId;
      targetBranchId = employee.branchId;
      if (employee === byBusinessCode && employee !== byLegacyId) {
        warnings.push(
          `legacy=${row.user_id}: inconsistent emp_code corrected using employee business code ${row.emp_code}`,
        );
      }
    }
  }

  if (targetBranchId == null && row.branch_id_fk != null && row.branch_id_fk > 0) {
    const mappedBranch = context.branchByLegacyId.get(row.branch_id_fk);
    if (!mappedBranch) {
      throw new Error(
        `No branch mapping for legacy user ${row.user_id}; legacy branch=${row.branch_id_fk}`,
      );
    }
    targetBranchId = mappedBranch;
  }

  const password = String(row.password ?? '').trim();
  if (password && !/^\$2[aby]\$\d{2}\$/.test(password) && !/^[a-f0-9]{40}$/i.test(password)) {
    warnings.push(`legacy=${row.user_id}: password format is not recognized; account disabled`);
    approved = 0;
  }
  if (!password) {
    warnings.push(`legacy=${row.user_id}: password is empty; account disabled`);
    approved = 0;
  }

  const image = cleanText(row.image, 500);
  const invalidImage = image?.startsWith('<') || image?.includes('did not select a file');
  if (invalidImage) warnings.push(`legacy=${row.user_id}: invalid image placeholder removed`);

  return {
    warnings,
    data: {
      agent_brok_fk: row.agent_brok_fk,
      emp_code: employeeId,
      username,
      password: password || null,
      name: cleanText(row.name, 100),
      email: cleanText(row.email, 50),
      address: cleanText(row.address, 200),
      level: row.level,
      role_id_fk: row.role_id_fk,
      image: invalidImage ? null : image,
      // Transitional legacy login secret. Auth clears this field immediately
      // after a successful login and replaces password with bcrypt.
      x_y_z: cleanText(row.x_y_z, 300),
      branch_id_fk: targetBranchId,
      approved,
      device_token: '',
      must_change_password: false,
    },
  };
}

export function userSourceKey(legacyUrl: string): string {
  const configured =
    process.env.LEGACY_SOURCE_KEY?.trim() || process.env.LEGACY_USER_SOURCE_KEY?.trim();
  if (configured) {
    if (configured.length > 191) throw new Error('LEGACY_SOURCE_KEY must be at most 191 characters');
    return configured;
  }
  return employeeSourceKey(legacyUrl);
}
