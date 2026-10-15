/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const BASIC_SALARY = 5000;
const IMPORT_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Cairo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());

const roster = [
  { name: 'محمد رشاد', gender: 1, phone: '01090001001' },
  { name: 'محمد محمود', gender: 1, phone: '01090001002' },
  { name: 'محمد ابراهيم', gender: 1, phone: '01090001003' },
  { name: 'عز حسنين', gender: 1, phone: '01090001004' },
  { name: 'منار محمد', gender: 2, phone: '01090001005' },
  { name: 'روان محمد', gender: 2, phone: '01090001006' },
  { name: 'عمرو صحصاح', gender: 1, phone: '01090001007' },
  { name: 'محمد عمرو', gender: 1, phone: '01090001008' },
  { name: 'محمود سالم', gender: 1, phone: '01090001009' },
  { name: 'تامر الهواري', gender: 1, phone: '01090001010' },
  { name: 'ياسين', gender: 1, phone: '01090001011' },
  { name: 'مروان عمروصي', gender: 1, phone: '01090001012' },
] as const;

async function main() {
  const branches = await prisma.tbl_branches.findMany({
    orderBy: { branch_id: 'asc' },
  });
  const branch =
    branches.find((row) => /one\s*80/i.test(row.branch_name ?? '')) ??
    branches[0];
  if (!branch) throw new Error('لا يوجد فرع لإضافة الموظفين إليه');

  const trainerJobs = await prisma.department_jobs.findMany({
    where: { is_trainer: true },
    orderBy: { id: 'asc' },
  });
  let trainerJob =
    trainerJobs.find((row) => row.name.trim() === 'مدرب') ??
    trainerJobs.find((row) => /مدرب لياقة/.test(row.name)) ??
    trainerJobs[0];

  if (!trainerJob) {
    const existing = await prisma.department_jobs.findFirst({
      where: { name: 'مدرب' },
      orderBy: { id: 'asc' },
    });
    trainerJob = existing
      ? await prisma.department_jobs.update({
          where: { id: existing.id },
          data: { is_trainer: true },
        })
      : await prisma.department_jobs.create({
          data: { name: 'مدرب', is_trainer: true },
        });
  }

  const imported: Array<{ name: string; employeeId: number; empCode: number }> = [];
  const skipped: Array<{ name: string; employeeId: number; empCode: number | null }> = [];

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT branch_id FROM tbl_branches WHERE branch_id = ${branch.branch_id} FOR UPDATE`;
    let nextCode =
      ((await tx.employees.aggregate({ _max: { emp_code: true } }))._max.emp_code ?? 1000) + 1;

    for (const person of roster) {
      const existing = await tx.employees.findFirst({
        where: { employee: person.name },
        orderBy: { id: 'asc' },
        select: { id: true, emp_code: true },
      });
      if (existing) {
        skipped.push({ name: person.name, employeeId: existing.id, empCode: existing.emp_code });
        continue;
      }

      const empCode = nextCode++;
      const employee = await tx.employees.create({
        data: {
          employee: person.name,
          emp_code: empCode,
          emp_code_g: empCode,
          branch_id_fk: branch.branch_id,
          emp_type: person.gender,
          gender: person.gender,
          phone: person.phone,
          status: 1,
          leave_emp: 0,
          employee_type: 1,
          employment_type: 'دوام كامل',
          contract: 'دوام كامل',
          start_work_date_m: IMPORT_DATE,
          basic_salary: BASIC_SALARY,
          mosma_wazefy_code: trainerJob.id,
          mosma_wazefy_n: trainerJob.name,
          tamin_mosama_wazefy: trainerJob.name,
          demo_card: String(empCode),
          card_num: BigInt(empCode),
          date_ar: IMPORT_DATE,
          date_s: String(Math.floor(Date.now() / 1000)),
          neqat_total: 7000,
          shahadt_jaish: 'no',
          tamin_rkm: 0,
          khedma_year: 0,
          age: 0,
          is_sales: false,
        },
      });

      await tx.employees_branches.create({
        data: {
          branch_id_fk: branch.branch_id,
          emp_id_fk: employee.id,
          date: IMPORT_DATE,
        },
      });

      const trainer = await tx.club_trainers.create({
        data: {
          employee_id: employee.id,
          name: person.name,
          phone: person.phone,
          specialization: trainerJob.name,
          is_active: true,
          is_deleted: false,
        },
      });

      await tx.club_trainer_salaries.create({
        data: {
          trainer_id: trainer.id,
          base_salary: BASIC_SALARY,
          class_commission_percentage: 0,
          subscription_commission_percentage: 0,
          effective_date: IMPORT_DATE,
          is_active: true,
          notes: 'استيراد جماعي للمدربين',
        },
      });

      imported.push({ name: person.name, employeeId: employee.id, empCode });
    }
  });

  console.log(JSON.stringify({
    branch: { id: branch.branch_id, name: branch.branch_name },
    jobTitle: { id: trainerJob.id, name: trainerJob.name },
    salary: BASIC_SALARY,
    imported,
    skipped,
    loginAccountsCreated: 0,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
