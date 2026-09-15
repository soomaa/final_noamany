import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { assertNotPastDate, assertUnique } from '../../common/validators/validation.util';
import { paginated } from '../../common/dto/list-result';
import { PrismaService } from '../../common/prisma/prisma.service';
import { todayIso } from '../../common/utils/legacy-date.util';
import { PushService } from '../push/push.service';
import {
  CoursesDto,
  CreateApplicationDto,
  InterviewDateDto,
  InterviewDto,
  JobOfferDto,
  PersonsDto,
  PreviousWorkDto,
  QualificationsDto,
  SkillsDto,
  UpdateApplicationDto,
} from './dto/application.dto';
import {
  CreateJobRequestDto,
  ListApplicationsDto,
  ListJobRequestsDto,
  UpdateJobRequestDto,
} from './dto/job-request.dto';

@Injectable()
export class JobRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  async list(q: ListJobRequestsDto) {
    const and: Prisma.hr_job_requestWhereInput[] = [];
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({
        OR: [{ date_talab_ar: { contains: s } }, { date_ar: { contains: s } }],
      });
    }

    const where: Prisma.hr_job_requestWhereInput = and.length ? { AND: and } : {};
    const [rows, total] = await Promise.all([
      this.prisma.hr_job_request.findMany({ where, orderBy: { id: 'desc' }, skip: q.skip, take: q.take }),
      this.prisma.hr_job_request.count({ where }),
    ]);

    const data = await Promise.all(
      rows.map(async (row) => {
        const jobTitle = row.job_title_id_fk
          ? await this.prisma.all_defined_setting.findUnique({ where: { defined_id: row.job_title_id_fk } })
          : null;
        return {
          id: row.id,
          title: jobTitle?.defined_title ?? `طلب #${row.rkm_talab ?? row.id}`,
          employeeName: row.num_for_job != null ? String(row.num_for_job) : '',
          createdAt: row.date_talab_ar ?? row.date_ar,
        };
      }),
    );

    return paginated(data, total, q.page, q.pageSize);
  }

  async getOne(id: number) {
    const row = await this.prisma.hr_job_request.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('طلب التوظيف غير موجود');

    const details = await this.prisma.hr_job_request_details.findMany({
      where: { OR: [{ request_id_fk: id }, { job_request_id_fk: id }] },
      orderBy: { id: 'asc' },
    });

    return {
      id: row.id,
      rkmTalab: row.rkm_talab,
      depId: row.dep_id_fk,
      subDepId: row.sub_dep_id_fk,
      jobTitleId: row.job_title_id_fk,
      numForJob: row.num_for_job,
      jobType: row.job_type,
      jobNatural: row.job_natural,
      date: row.date_talab_ar ?? row.date_ar,
      details: details.map((d) => ({ id: d.id, type: d.type, title: d.details ?? d.title })),
    };
  }

  async create(dto: CreateJobRequestDto, publisherId?: number) {
    const dateStr = todayIso();
    const row = await this.prisma.hr_job_request.create({
      data: {
        dep_id_fk: dto.depId,
        sub_dep_id_fk: dto.subDepId,
        job_title_id_fk: dto.jobTitleId,
        num_for_job: dto.numForJob,
        job_type: dto.jobType,
        job_natural: dto.jobNatural,
        date: dateStr,
        date_ar: dateStr,
        date_talab: dateStr,
        date_talab_ar: dateStr,
        publisher: publisherId,
        rkm_talab: await this.nextRkmTalab(),
      },
    });

    if (dto.details?.length) {
      await this.insertDetails(row.id, dto.details);
    }

    return { id: row.id };
  }

  async update(id: number, dto: UpdateJobRequestDto) {
    await this.getOne(id);
    await this.prisma.hr_job_request.update({
      where: { id },
      data: {
        ...(dto.depId != null ? { dep_id_fk: dto.depId } : {}),
        ...(dto.subDepId != null ? { sub_dep_id_fk: dto.subDepId } : {}),
        ...(dto.jobTitleId != null ? { job_title_id_fk: dto.jobTitleId } : {}),
        ...(dto.numForJob != null ? { num_for_job: dto.numForJob } : {}),
        ...(dto.jobType != null ? { job_type: dto.jobType } : {}),
        ...(dto.jobNatural != null ? { job_natural: dto.jobNatural } : {}),
      },
    });

    if (dto.details) {
      await this.prisma.hr_job_request_details.deleteMany({
        where: { OR: [{ request_id_fk: id }, { job_request_id_fk: id }] },
      });
      await this.insertDetails(id, dto.details);
    }

    return { id };
  }

  async remove(id: number) {
    await this.getOne(id);
    await this.prisma.hr_job_request_details.deleteMany({
      where: { OR: [{ request_id_fk: id }, { job_request_id_fk: id }] },
    });
    await this.prisma.hr_job_request.delete({ where: { id } });
    return { id };
  }

  async listApplications(q: ListApplicationsDto) {
    const and: Prisma.job_request_ordersWhereInput[] = [];
    if (q.search?.trim()) {
      const s = q.search.trim();
      and.push({
        OR: [{ name: { contains: s } }, { national_num: { contains: s } }, { email: { contains: s } }],
      });
    }

    const where: Prisma.job_request_ordersWhereInput = and.length ? { AND: and } : {};
    const [rows, total] = await Promise.all([
      this.prisma.job_request_orders.findMany({ where, orderBy: { id: 'desc' }, skip: q.skip, take: q.take }),
      this.prisma.job_request_orders.count({ where }),
    ]);

    const data = rows.map((row) => ({
      id: row.id,
      title: row.job_name_other ?? row.name,
      employeeName: row.name,
      createdAt: row.date_ar ?? row.date,
      jobRequestId: row.job_request_id_fk,
    }));

    return paginated(data, total, q.page, q.pageSize);
  }

  async getApplication(id: number) {
    const row = await this.prisma.job_request_orders.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('طلب المتقدم غير موجود');

    // Aggregate all the application sub-entities (intake wizard tabs).
    const [previousWork, qualifications, courses, skills, persons, interview] = await Promise.all([
      this.getPreviousWork(id),
      this.getQualifications(id),
      this.getCourses(id),
      this.getSkills(id),
      this.getPersons(id),
      this.getInterview(id),
    ]);

    const jobTitle = row.job_request_id_fk
      ? await this.prisma.hr_job_request.findUnique({ where: { id: row.job_request_id_fk } })
      : null;

    return {
      ...row,
      jobTitleId: jobTitle?.job_title_id_fk ?? null,
      previousWork,
      qualifications,
      courses,
      skills,
      persons,
      interview,
    };
  }

  /* =======================================================================
   *  Application intake (job_request_orders) — legacy Job_request_model
   * ===================================================================== */

  async createApplication(dto: CreateApplicationDto) {
    if (dto.nationalNum?.trim()) {
      await assertUnique(
        () =>
          this.prisma.job_request_orders.findFirst({
            where: { national_num: dto.nationalNum!.trim() },
          }),
        'الرقم القومي مسجل مسبقاً لمتقدم آخر',
      );
    }
    const row = await this.prisma.job_request_orders.create({
      data: this.applicationData(dto),
    });
    return { id: row.id };
  }

  async updateApplication(id: number, dto: UpdateApplicationDto) {
    await this.getApplicationOrThrow(id);
    if (dto.nationalNum?.trim()) {
      await assertUnique(
        () =>
          this.prisma.job_request_orders.findFirst({
            where: { national_num: dto.nationalNum!.trim(), id: { not: id } },
          }),
        'الرقم القومي مسجل مسبقاً لمتقدم آخر',
      );
    }
    await this.prisma.job_request_orders.update({
      where: { id },
      data: this.applicationData(dto),
    });
    return { id };
  }

  async removeApplication(id: number) {
    await this.getApplicationOrThrow(id);
    // Mirror Delete_application cascade across all sub-entity tables.
    await this.prisma.$executeRaw`DELETE FROM hr_previous_work_job_orders WHERE job_request_ordered_fk = ${String(id)}`;
    await this.prisma.$executeRaw`DELETE FROM hr_qualification_job_orders WHERE job_request_ordered_fk = ${String(id)}`;
    await this.prisma.$executeRaw`DELETE FROM hr_dwrat_job_orders WHERE job_request_ordered_fk = ${String(id)}`;
    await this.prisma.$executeRaw`DELETE FROM hr_skills_job_orders WHERE job_request_ordered_fk = ${String(id)}`;
    await this.prisma.$executeRaw`DELETE FROM hr_persons_job_orders WHERE job_request_ordered_fk = ${String(id)}`;
    await this.prisma.$executeRaw`DELETE FROM hr_interview_degree WHERE job_request_ordered_fk = ${String(id)}`;
    await this.prisma.$executeRaw`DELETE FROM hr_interview_degree_adv_disadv WHERE job_request_ordered_fk = ${id}`;
    await this.prisma.$executeRaw`DELETE FROM hr_job_orders_offers WHERE job_request_ordered_fk = ${String(id)}`;
    await this.prisma.job_request_orders.delete({ where: { id } });
    return { id };
  }

  private applicationData(dto: CreateApplicationDto): Prisma.job_request_ordersUncheckedCreateInput {
    return {
      name: dto.name,
      national_num: dto.nationalNum,
      gender_id_fk: dto.genderIdFk,
      nationality_id_fk: dto.nationalityIdFk,
      social_status: dto.socialStatus,
      date_birth: dto.dateBirth,
      date_birth_hijri: dto.dateBirthHijri,
      place_birth: dto.placeBirth,
      city: dto.city,
      hai: dto.hai,
      job_request_id_fk: dto.jobRequestIdFk,
      job_name_other: dto.jobNameOther,
      mob: dto.mob,
      email: dto.email,
      work_now: dto.workNow,
    };
  }

  /* ---------------------- previous work ---------------------------- */
  async getPreviousWork(applicationId: number) {
    return this.prisma.$queryRaw`
      SELECT id, company_name, job_id_title_fk, date_from, date_to, job_mission, salary, leave_work_reason
      FROM hr_previous_work_job_orders WHERE job_request_ordered_fk = ${String(applicationId)} ORDER BY id ASC`;
  }

  async savePreviousWork(applicationId: number, dto: PreviousWorkDto) {
    await this.getApplicationOrThrow(applicationId);
    for (const it of dto.items) {
      await this.prisma.$executeRaw`
        INSERT INTO hr_previous_work_job_orders
          (job_request_ordered_fk, company_name, job_id_title_fk, date_from, date_to, job_mission, salary, leave_work_reason)
        VALUES (${String(applicationId)}, ${it.companyName}, ${it.jobIdTitleFk ?? '0'}, ${it.dateFrom ?? '0'},
                ${it.dateTo ?? '0'}, ${it.jobMission ?? '0'}, ${it.salary ?? '0'}, ${it.leaveWorkReason ?? '0'})`;
    }
    return { ok: true, count: dto.items.length };
  }

  /* ---------------------- qualifications --------------------------- */
  async getQualifications(applicationId: number) {
    return this.prisma.$queryRaw`
      SELECT id, degree_id_fk, qualification_id_fk, school, specialied, year, taqder, img
      FROM hr_qualification_job_orders WHERE job_request_ordered_fk = ${String(applicationId)} ORDER BY id ASC`;
  }

  async saveQualifications(applicationId: number, dto: QualificationsDto) {
    await this.getApplicationOrThrow(applicationId);
    for (const it of dto.items) {
      await this.prisma.$executeRaw`
        INSERT INTO hr_qualification_job_orders
          (job_request_ordered_fk, degree_id_fk, qualification_id_fk, school, specialied, year, taqder, img)
        VALUES (${String(applicationId)}, ${it.degreeIdFk ?? '0'}, ${it.qualificationIdFk ?? '0'}, ${it.school ?? '0'},
                ${it.specialied ?? '0'}, ${it.year ?? '0'}, ${it.taqder ?? '0'}, ${it.img ?? '0'})`;
    }
    return { ok: true, count: dto.items.length };
  }

  /* -------------------------- courses ------------------------------ */
  async getCourses(applicationId: number) {
    return this.prisma.$queryRaw`
      SELECT id, dawra, place, date_from, date_to, specialized, img
      FROM hr_dwrat_job_orders WHERE job_request_ordered_fk = ${String(applicationId)} ORDER BY id ASC`;
  }

  async saveCourses(applicationId: number, dto: CoursesDto) {
    await this.getApplicationOrThrow(applicationId);
    for (const it of dto.items) {
      await this.prisma.$executeRaw`
        INSERT INTO hr_dwrat_job_orders
          (job_request_ordered_fk, dawra, place, date_from, date_to, specialized, img)
        VALUES (${String(applicationId)}, ${it.dawra}, ${it.place ?? '0'}, ${it.dateFrom ?? '0'},
                ${it.dateTo ?? '0'}, ${it.specialized ?? '0'}, ${it.img ?? '0'})`;
    }
    return { ok: true, count: dto.items.length };
  }

  /* --------------------------- skills ------------------------------ */
  async getSkills(applicationId: number) {
    return this.prisma.$queryRaw`
      SELECT id, name, details, efficiency_id_fk
      FROM hr_skills_job_orders WHERE job_request_ordered_fk = ${String(applicationId)} ORDER BY id ASC`;
  }

  async saveSkills(applicationId: number, dto: SkillsDto) {
    await this.getApplicationOrThrow(applicationId);
    for (const it of dto.items) {
      await this.prisma.$executeRaw`
        INSERT INTO hr_skills_job_orders
          (job_request_ordered_fk, name, details, efficiency_id_fk)
        VALUES (${String(applicationId)}, ${it.name}, ${it.details ?? '0'}, ${it.efficiencyIdFk ?? '0'})`;
    }
    return { ok: true, count: dto.items.length };
  }

  /* ----------------------- references (persons) -------------------- */
  async getPersons(applicationId: number) {
    return this.prisma.$queryRaw`
      SELECT id, job, job_name, job_place, mob
      FROM hr_persons_job_orders WHERE job_request_ordered_fk = ${String(applicationId)} ORDER BY id ASC`;
  }

  async savePersons(applicationId: number, dto: PersonsDto) {
    await this.getApplicationOrThrow(applicationId);
    for (const it of dto.items) {
      await this.prisma.$executeRaw`
        INSERT INTO hr_persons_job_orders
          (job_request_ordered_fk, job, job_name, job_place, mob)
        VALUES (${String(applicationId)}, ${it.job}, ${it.jobName ?? '0'}, ${it.jobPlace ?? '0'}, ${it.mob ?? '0'})`;
    }
    return { ok: true, count: dto.items.length };
  }

  /* ----------------------- interview date -------------------------- */
  async setInterviewDate(applicationId: number, dto: InterviewDateDto, actorUserId?: number) {
    const applicant = await this.getApplicationOrThrow(applicationId);
    assertNotPastDate(dto.interviewDate, 'لا يمكن تحديد موعد مقابلة في الماضي');

    await this.prisma.job_request_orders.update({
      where: { id: applicationId },
      data: { determine_interview: 1, interview_date: dto.interviewDate },
    });

    const body = `موعد المقابلة: ${dto.interviewDate}`;
    const userByEmail = applicant.email?.trim()
      ? await this.prisma.users.findFirst({ where: { email: applicant.email.trim() } })
      : null;
    if (userByEmail) {
      await this.push.sendToUsers(
        [userByEmail.user_id],
        `موعد مقابلة — ${applicant.name}`,
        body,
        actorUserId,
      );
    } else if (actorUserId) {
      await this.push.sendToUsers(
        [actorUserId],
        `تحديد مقابلة — ${applicant.name}`,
        `${body} — يرجى إبلاغ المتقدم (${applicant.mob ?? applicant.email ?? 'بدون تواصل'})`,
        actorUserId,
      );
    }

    return { id: applicationId };
  }

  /* --------------------- interview (degrees) ----------------------- */
  async getInterview(applicationId: number) {
    const [degrees, positives, negatives] = await Promise.all([
      this.prisma.$queryRaw<{ id: number; item_id_fk: string; item_degree: string }[]>`
        SELECT id, item_id_fk, item_degree FROM hr_interview_degree
        WHERE job_request_ordered_fk = ${String(applicationId)} ORDER BY id ASC`,
      this.prisma.$queryRaw<{ id: number; title: string }[]>`
        SELECT id, title FROM hr_interview_degree_adv_disadv
        WHERE job_request_ordered_fk = ${applicationId} AND type = '1' ORDER BY id ASC`,
      this.prisma.$queryRaw<{ id: number; title: string }[]>`
        SELECT id, title FROM hr_interview_degree_adv_disadv
        WHERE job_request_ordered_fk = ${applicationId} AND type = '2' ORDER BY id ASC`,
    ]);
    return { degrees, positives, negatives };
  }

  /**
   * Persist the interview scoring grid + strengths/weaknesses and mark the
   * application as interviewed. Faithful port of Job_request_model::insert_file.
   */
  async saveInterview(applicationId: number, dto: InterviewDto, publisherName?: string | null) {
    await this.getApplicationOrThrow(applicationId);

    // replace per-item degrees
    await this.prisma.$executeRaw`DELETE FROM hr_interview_degree WHERE job_request_ordered_fk = ${String(applicationId)}`;
    const dateStr = todayIso();
    for (const d of dto.degrees) {
      await this.prisma.$executeRaw`
        INSERT INTO hr_interview_degree
          (job_request_ordered_fk, item_id_fk, item_degree, publisher, date, date_ar)
        VALUES (${String(applicationId)}, ${d.itemIdFk}, ${d.itemDegree}, ${publisherName ?? ''}, ${dateStr}, ${'0'})`;
    }

    // replace strengths (type=1) + weaknesses (type=2)
    await this.prisma.$executeRaw`DELETE FROM hr_interview_degree_adv_disadv WHERE job_request_ordered_fk = ${applicationId} AND type = '1'`;
    for (const title of dto.positive ?? []) {
      if (!title?.trim()) continue;
      await this.prisma.$executeRaw`
        INSERT INTO hr_interview_degree_adv_disadv (job_request_ordered_fk, title, type)
        VALUES (${applicationId}, ${title}, ${'1'})`;
    }
    await this.prisma.$executeRaw`DELETE FROM hr_interview_degree_adv_disadv WHERE job_request_ordered_fk = ${applicationId} AND type = '2'`;
    for (const title of dto.negative ?? []) {
      if (!title?.trim()) continue;
      await this.prisma.$executeRaw`
        INSERT INTO hr_interview_degree_adv_disadv (job_request_ordered_fk, title, type)
        VALUES (${applicationId}, ${title}, ${'2'})`;
    }

    // total: posted value, else computed from the degree grid
    const computed = dto.degrees.reduce((s, d) => {
      const v = parseFloat(d.itemDegree);
      return s + (Number.isFinite(v) ? v : 0);
    }, 0);
    const total = dto.total != null && dto.total !== '' ? dto.total : String(computed);

    await this.prisma.job_request_orders.update({
      where: { id: applicationId },
      data: { do_interview: 1, total_degree: total },
    });

    return { id: applicationId, total };
  }

  /* --------------------------- job offers -------------------------- */
  async getJobOffer(applicationId: number) {
    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT * FROM hr_job_orders_offers WHERE job_request_ordered_fk = ${String(applicationId)} LIMIT 1`;
    return rows[0] ?? null;
  }

  /**
   * Upsert the job offer for an application.
   * Faithful port of Job_request_model::insert_offer_work.
   */
  async saveJobOffer(applicationId: number, dto: JobOfferDto, publisherName?: string | null) {
    await this.getApplicationOrThrow(applicationId);
    const dateStr = todayIso();
    const exists = await this.prisma.$queryRaw<{ c: bigint }[]>`
      SELECT COUNT(*) AS c FROM hr_job_orders_offers WHERE job_request_ordered_fk = ${String(applicationId)}`;
    const count = Number(exists[0]?.c ?? 0);

    if (count === 0) {
      await this.prisma.$executeRaw`
        INSERT INTO hr_job_orders_offers
          (job_request_ordered_fk, salaray, bdl_sakn, bdl_moslat, medical_insurance, contract_peroid,
           contract_type_fk, demo_days, yearly_vacation, other, notes, date, date_ar, publisher, suspend)
        VALUES (${String(applicationId)}, ${dto.salary ?? null}, ${dto.bdlSakn ?? null}, ${dto.bdlMoslat ?? null},
                ${dto.medicalInsurance ?? null}, ${dto.contractPeroid ?? null}, ${dto.contractTypeFk ?? null},
                ${dto.demoDays ?? null}, ${dto.yearlyVacation ?? null}, ${dto.other ?? null}, ${dto.notes ?? null},
                ${dateStr}, ${dateStr}, ${publisherName ?? ''}, ${'0'})`;
    } else {
      await this.prisma.$executeRaw`
        UPDATE hr_job_orders_offers SET
          salaray = ${dto.salary ?? null}, bdl_sakn = ${dto.bdlSakn ?? null}, bdl_moslat = ${dto.bdlMoslat ?? null},
          medical_insurance = ${dto.medicalInsurance ?? null}, contract_peroid = ${dto.contractPeroid ?? null},
          contract_type_fk = ${dto.contractTypeFk ?? null}, demo_days = ${dto.demoDays ?? null},
          yearly_vacation = ${dto.yearlyVacation ?? null}, other = ${dto.other ?? null}, notes = ${dto.notes ?? null},
          date = ${dateStr}, date_ar = ${dateStr}, publisher = ${publisherName ?? ''}
        WHERE job_request_ordered_fk = ${String(applicationId)}`;
    }
    return { id: applicationId };
  }

  /** Applications that have completed the interview (job-offers tab source). */
  async listOffers(q: ListApplicationsDto) {
    const where: Prisma.job_request_ordersWhereInput = { do_interview: 1 };
    if (q.search?.trim()) {
      const s = q.search.trim();
      where.OR = [{ name: { contains: s } }, { national_num: { contains: s } }];
    }
    const [rows, total] = await Promise.all([
      this.prisma.job_request_orders.findMany({ where, orderBy: { id: 'desc' }, skip: q.skip, take: q.take }),
      this.prisma.job_request_orders.count({ where }),
    ]);
    const data = rows.map((row) => ({
      id: row.id,
      title: row.job_name_other ?? row.name,
      employeeName: row.name,
      nationalNum: row.national_num,
      totalDegree: row.total_degree,
      interviewDate: row.interview_date,
      createdAt: row.date_ar ?? row.date,
    }));
    return paginated(data, total, q.page, q.pageSize);
  }

  private async getApplicationOrThrow(id: number) {
    const row = await this.prisma.job_request_orders.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('طلب المتقدم غير موجود');
    return row;
  }

  private async insertDetails(jobRequestId: number, details: { type: number; title: string }[]) {
    for (const d of details) {
      await this.prisma.hr_job_request_details.create({
        data: {
          request_id_fk: jobRequestId,
          details: d.title,
          // Dual-write the pre-existing target aliases until all target-only rows are normalized.
          job_request_id_fk: jobRequestId,
          title: d.title,
          type: d.type,
        },
      });
    }
  }

  private async nextRkmTalab(): Promise<number> {
    const last = await this.prisma.hr_job_request.findFirst({
      orderBy: { rkm_talab: 'desc' },
      select: { rkm_talab: true },
    });
    return (last?.rkm_talab ?? 0) + 1;
  }
}
