import { PrismaService } from '../prisma/prisma.service';
import { JwtUser } from '../types/jwt-user';
import { managerKind, managerSection } from './manager-scope.util';

const RECEPTION_TITLE = /(استقبال|ريسيبشن|ريسبشن|reception)/i;

/**
 * Staff a branch manager / section supervisor answers for (client sheet, 22 Nov): employees of
 * their branch(es) in their section (men 0/1, women 2; «both» 3 counts for either) plus every
 * reception employee of those branches. null = not a manager (no extra restriction).
 */
export async function managerStaff(
  prisma: PrismaService,
  user: JwtUser | undefined | null,
  branches: number[] | null,
): Promise<Array<{ id: number; emp_code: number | null }> | null> {
  if (!managerKind(user)) return null;
  const section = managerSection(user);
  const jobs = await prisma.department_jobs.findMany({ select: { id: true, name: true } });
  const receptionJobIds = jobs.filter((j) => RECEPTION_TITLE.test(j.name)).map((j) => j.id);
  const types = section === 'female' ? [2, 3] : section === 'male' ? [0, 1, 3] : null;
  return prisma.employees.findMany({
    where: {
      ...(branches ? { branch_id_fk: { in: branches } } : {}),
      OR: [
        types ? { emp_type: { in: types } } : {},
        ...(receptionJobIds.length ? [{ mosma_wazefy_code: { in: receptionJobIds } }] : []),
      ],
    },
    select: { id: true, emp_code: true },
  });
}
