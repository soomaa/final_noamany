import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

type PrivateFileClaimClient = Pick<Prisma.TransactionClient, 'private_file_metadata'>;

export function opaquePrivateFileId(value: unknown): string | null {
  const normalized = String(value ?? '').trim();
  if (!normalized || normalized === '0') return null;
  const match = /^file:([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.exec(
    normalized,
  );
  if (!match) throw new BadRequestException('مرجع الملف الخاص غير صالح');
  return match[1].toLowerCase();
}

export async function claimEmployeePrivateFile(
  client: PrivateFileClaimClient,
  value: unknown,
  employeeId: number,
  actorUserId: number | undefined,
  allowedCategories: readonly string[],
): Promise<void> {
  const id = opaquePrivateFileId(value);
  if (!id) return;
  if (!actorUserId) throw new ForbiddenException('تعذر إثبات صاحب الملف');

  const claimed = await client.private_file_metadata.updateMany({
    where: {
      id,
      category: { in: [...allowedCategories] },
      deleted_at: null,
      OR: [
        { owner_employee_id: employeeId },
        { owner_employee_id: null, uploaded_by: actorUserId },
      ],
    },
    data: { owner_employee_id: employeeId },
  });
  if (claimed.count !== 1) {
    throw new ForbiddenException('الملف غير موجود أو لا يخص المستخدم الحالي');
  }
}

export async function claimActorPrivateFile(
  client: PrivateFileClaimClient,
  value: unknown,
  actorUserId: number | undefined,
  allowedCategories: readonly string[],
): Promise<void> {
  const id = opaquePrivateFileId(value);
  if (!id) return;
  if (!actorUserId) throw new ForbiddenException('تعذر إثبات صاحب الملف');
  const claimed = await client.private_file_metadata.updateMany({
    where: { id, category: { in: [...allowedCategories] }, uploaded_by: actorUserId, deleted_at: null },
    data: {},
  });
  if (claimed.count !== 1) throw new ForbiddenException('الملف غير موجود أو لا يخص المستخدم الحالي');
}
