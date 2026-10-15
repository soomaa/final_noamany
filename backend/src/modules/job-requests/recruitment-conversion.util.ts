import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

type RecruitmentTx = Pick<Prisma.TransactionClient, '$queryRaw' | 'job_request_orders'>;

export async function claimAcceptedRecruitmentApplication(
  tx: RecruitmentTx,
  applicationId: number,
  nationalNumber?: string,
) {
  await tx.$queryRaw`SELECT id FROM job_request_orders WHERE id = ${applicationId} FOR UPDATE`;
  const application = await tx.job_request_orders.findUnique({ where: { id: applicationId } });
  if (!application) throw new NotFoundException('طلب المتقدم غير موجود');
  if (application.converted_employee_id != null || application.pipeline_status === 'converted') {
    throw new ConflictException('تم تحويل المتقدم إلى موظف بالفعل');
  }
  if (application.pipeline_status !== 'accepted') {
    throw new BadRequestException('يجب قبول عرض العمل قبل بدء تحويل المتقدم إلى موظف');
  }
  const expectedIdentity = application.national_num?.trim();
  if (nationalNumber?.trim() && expectedIdentity && nationalNumber.trim() !== expectedIdentity) {
    throw new BadRequestException('رقم هوية الموظف لا يطابق طلب التوظيف المقبول');
  }
  return application;
}

export async function completeRecruitmentConversion(
  tx: RecruitmentTx,
  applicationId: number,
  employeeId: number,
) {
  await tx.job_request_orders.update({
    where: { id: applicationId },
    data: {
      pipeline_status: 'converted',
      converted_employee_id: employeeId,
      converted_at: new Date(),
      status_changed_at: new Date(),
    },
  });
}
