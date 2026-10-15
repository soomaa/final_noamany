import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { paginated } from '../../common/dto/list-result';
import { toNum } from './club-fitness.utils';
import { attachMemberBrief, loadMemberBriefMap, searchMemberIds } from '../club-members/club-member-brief.utils';
import { ListClubFitnessDto } from './dto/list-club-fitness.dto';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';

@Injectable()
export class ClubWorkoutsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
  ) {}

  private async allowedMemberIds(user?: JwtUser): Promise<number[] | null> {
    const scope = this.branchScope.allowedBranchIds(user);
    if (scope === null) return null;
    const rows = await this.prisma.club_members.findMany({
      where: { branch_id: { in: scope }, is_deleted: false },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  private async assertMemberAccess(memberId: number, user?: JwtUser) {
    const member = await this.prisma.club_members.findFirst({
      where: { id: memberId, is_deleted: false },
      select: { branch_id: true },
    });
    if (!member) throw new NotFoundException('العضو غير موجود');
    if (!this.branchScope.isBranchAllowed(user, member.branch_id)) {
      throw new ForbiddenException('لا تملك صلاحية الوصول لبيانات هذا الفرع');
    }
  }

  // --- Exercises ---

  async listExercises(q: ListClubFitnessDto) {
    const where: Prisma.club_exercisesWhereInput = {};
    if (q.search?.trim()) {
      const s = q.search.trim();
      where.OR = [
        { name: { contains: s } },
        { category: { contains: s } },
        { muscle_group: { contains: s } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.club_exercises.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.club_exercises.count({ where }),
    ]);
    return paginated(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        category: r.category,
        muscleGroup: r.muscle_group,
        description: r.description,
        instructions: r.instructions,
        setsDefault: r.sets_default,
        repsDefault: r.reps_default,
        difficulty: r.difficulty,
        isActive: r.is_active,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
      total,
      q.page,
      q.pageSize,
    );
  }

  async findExercise(id: number) {
    const row = await this.prisma.club_exercises.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('التمرين غير موجود');
    return {
      id: row.id,
      name: row.name,
      category: row.category,
      muscleGroup: row.muscle_group,
      description: row.description,
      instructions: row.instructions,
      setsDefault: row.sets_default,
      repsDefault: row.reps_default,
      difficulty: row.difficulty,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async createExercise(body: Record<string, unknown>) {
    if (!body.name) throw new BadRequestException('اسم التمرين مطلوب');
    const row = await this.prisma.club_exercises.create({
      data: {
        name: String(body.name).trim(),
        category: body.category ? String(body.category) : null,
        muscle_group: body.muscleGroup ? String(body.muscleGroup) : null,
        description: body.description ? String(body.description) : null,
        instructions: body.instructions ? String(body.instructions) : null,
        sets_default: body.setsDefault != null ? Number(body.setsDefault) : null,
        reps_default: body.repsDefault != null ? Number(body.repsDefault) : null,
        difficulty: (body.difficulty as Prisma.EnumClubFitnessDifficultyFieldUpdateOperationsInput['set']) ?? 'medium',
        is_active: body.isActive !== false,
      },
    });
    return this.findExercise(row.id);
  }

  async updateExercise(id: number, body: Record<string, unknown>) {
    await this.findExercise(id);
    await this.prisma.club_exercises.update({
      where: { id },
      data: {
        ...(body.name != null ? { name: String(body.name).trim() } : {}),
        ...(body.category !== undefined ? { category: body.category ? String(body.category) : null } : {}),
        ...(body.muscleGroup !== undefined ? { muscle_group: body.muscleGroup ? String(body.muscleGroup) : null } : {}),
        ...(body.description !== undefined ? { description: body.description ? String(body.description) : null } : {}),
        ...(body.instructions !== undefined ? { instructions: body.instructions ? String(body.instructions) : null } : {}),
        ...(body.setsDefault !== undefined ? { sets_default: body.setsDefault != null ? Number(body.setsDefault) : null } : {}),
        ...(body.repsDefault !== undefined ? { reps_default: body.repsDefault != null ? Number(body.repsDefault) : null } : {}),
        ...(body.difficulty != null ? { difficulty: String(body.difficulty) as Prisma.EnumClubFitnessDifficultyFieldUpdateOperationsInput['set'] } : {}),
        ...(body.isActive !== undefined ? { is_active: Boolean(body.isActive) } : {}),
      },
    });
    return this.findExercise(id);
  }

  async removeExercise(id: number) {
    await this.findExercise(id);
    await this.prisma.club_exercises.delete({ where: { id } });
    return { success: true };
  }

  // --- Workout programs ---

  async listPrograms(q: ListClubFitnessDto, user?: JwtUser) {
    const where: Prisma.club_workout_programsWhereInput = {};
    if (q.memberId) where.member_id = Number(q.memberId);
    if (q.search?.trim()) {
      const s = q.search.trim();
      const memberIds = await searchMemberIds(this.prisma, s);
      where.OR = [{ name: { contains: s } }, ...(memberIds.length ? [{ member_id: { in: memberIds } }] : [])];
    }
    const scopedIds = await this.allowedMemberIds(user);
    if (scopedIds !== null) {
      where.AND = [{ OR: [{ member_id: null }, { member_id: { in: scopedIds } }] }];
    }

    const [rows, total] = await Promise.all([
      this.prisma.club_workout_programs.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.club_workout_programs.count({ where }),
    ]);
    const memberMap = await loadMemberBriefMap(this.prisma, rows.map((r) => r.member_id));
    return paginated(
      rows.map((r) => ({
        id: r.id,
        memberId: r.member_id,
        ...attachMemberBrief(r.member_id, memberMap),
        trainerId: r.trainer_id,
        name: r.name,
        goal: r.goal,
        difficulty: r.difficulty,
        durationWeeks: r.duration_weeks,
        description: r.description,
        isActive: r.is_active,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
      total,
      q.page,
      q.pageSize,
    );
  }

  async findProgram(id: number, user?: JwtUser) {
    const row = await this.prisma.club_workout_programs.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('برنامج التمرين غير موجود');
    if (row.member_id != null) await this.assertMemberAccess(row.member_id, user);
    const memberMap = await loadMemberBriefMap(this.prisma, [row.member_id]);
    return {
      id: row.id,
      memberId: row.member_id,
      ...attachMemberBrief(row.member_id, memberMap),
      trainerId: row.trainer_id,
      name: row.name,
      goal: row.goal,
      difficulty: row.difficulty,
      durationWeeks: row.duration_weeks,
      description: row.description,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async createProgram(body: Record<string, unknown>, user?: JwtUser) {
    if (!body.name) throw new BadRequestException('اسم البرنامج مطلوب');
    if (body.memberId != null) {
      await this.assertMemberAccess(Number(body.memberId), user);
    }
    if (body.trainerId != null) {
      const trainer = await this.prisma.club_trainers.findFirst({
        where: { id: Number(body.trainerId), is_deleted: false },
      });
      if (!trainer) throw new NotFoundException('المدرب غير موجود');
    }
    const row = await this.prisma.club_workout_programs.create({
      data: {
        member_id: body.memberId != null ? Number(body.memberId) : null,
        trainer_id: body.trainerId != null ? Number(body.trainerId) : null,
        name: String(body.name).trim(),
        goal: body.goal ? String(body.goal) : null,
        difficulty: (body.difficulty as Prisma.EnumClubFitnessDifficultyFieldUpdateOperationsInput['set']) ?? 'medium',
        duration_weeks: body.durationWeeks != null ? Number(body.durationWeeks) : null,
        description: body.description ? String(body.description) : null,
        is_active: body.isActive !== false,
      },
    });
    return this.findProgram(row.id, user);
  }

  async updateProgram(id: number, body: Record<string, unknown>, user?: JwtUser) {
    await this.findProgram(id, user);
    if (body.memberId != null) {
      await this.assertMemberAccess(Number(body.memberId), user);
    }
    if (body.trainerId != null) {
      const trainer = await this.prisma.club_trainers.findFirst({
        where: { id: Number(body.trainerId), is_deleted: false },
      });
      if (!trainer) throw new NotFoundException('المدرب غير موجود');
    }
    await this.prisma.club_workout_programs.update({
      where: { id },
      data: {
        ...(body.memberId !== undefined ? { member_id: body.memberId != null ? Number(body.memberId) : null } : {}),
        ...(body.trainerId !== undefined ? { trainer_id: body.trainerId != null ? Number(body.trainerId) : null } : {}),
        ...(body.name != null ? { name: String(body.name).trim() } : {}),
        ...(body.goal !== undefined ? { goal: body.goal ? String(body.goal) : null } : {}),
        ...(body.difficulty != null ? { difficulty: String(body.difficulty) as Prisma.EnumClubFitnessDifficultyFieldUpdateOperationsInput['set'] } : {}),
        ...(body.durationWeeks !== undefined ? { duration_weeks: body.durationWeeks != null ? Number(body.durationWeeks) : null } : {}),
        ...(body.description !== undefined ? { description: body.description ? String(body.description) : null } : {}),
        ...(body.isActive !== undefined ? { is_active: Boolean(body.isActive) } : {}),
      },
    });
    return this.findProgram(id, user);
  }

  async removeProgram(id: number, user?: JwtUser) {
    await this.findProgram(id, user);
    await this.prisma.club_workout_programs.delete({ where: { id } });
    return { success: true };
  }

  // --- Workout templates ---

  async listTemplates(q: ListClubFitnessDto) {
    const where: Prisma.club_workout_templatesWhereInput = {};
    if (q.search?.trim()) where.name = { contains: q.search.trim() };

    const [rows, total] = await Promise.all([
      this.prisma.club_workout_templates.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.club_workout_templates.count({ where }),
    ]);
    return paginated(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        exercisesJson: r.exercises_json,
        isActive: r.is_active,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
      total,
      q.page,
      q.pageSize,
    );
  }

  async findTemplate(id: number) {
    const row = await this.prisma.club_workout_templates.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('قالب التمرين غير موجود');
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      exercisesJson: row.exercises_json,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async createTemplate(body: Record<string, unknown>) {
    if (!body.name) throw new BadRequestException('اسم القالب مطلوب');
    const row = await this.prisma.club_workout_templates.create({
      data: {
        name: String(body.name).trim(),
        description: body.description ? String(body.description) : null,
        exercises_json: (body.exercisesJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        is_active: body.isActive !== false,
      },
    });
    return this.findTemplate(row.id);
  }

  async updateTemplate(id: number, body: Record<string, unknown>) {
    await this.findTemplate(id);
    await this.prisma.club_workout_templates.update({
      where: { id },
      data: {
        ...(body.name != null ? { name: String(body.name).trim() } : {}),
        ...(body.description !== undefined ? { description: body.description ? String(body.description) : null } : {}),
        ...(body.exercisesJson !== undefined ? { exercises_json: (body.exercisesJson ?? Prisma.JsonNull) as Prisma.InputJsonValue } : {}),
        ...(body.isActive !== undefined ? { is_active: Boolean(body.isActive) } : {}),
      },
    });
    return this.findTemplate(id);
  }

  async removeTemplate(id: number) {
    await this.findTemplate(id);
    await this.prisma.club_workout_templates.delete({ where: { id } });
    return { success: true };
  }

  // --- Member progress ---

  async listProgress(q: ListClubFitnessDto, user?: JwtUser) {
    const where: Prisma.club_member_progressWhereInput = {};
    if (q.memberId) where.member_id = Number(q.memberId);
    if (q.search?.trim()) {
      const memberIds = await searchMemberIds(this.prisma, q.search);
      if (memberIds.length === 0) {
        return paginated([], 0, q.page, q.pageSize);
      }
      where.member_id = { in: memberIds };
    }
    const scopedIds = await this.allowedMemberIds(user);
    if (scopedIds !== null) where.AND = [{ member_id: { in: scopedIds } }];

    const [rows, total] = await Promise.all([
      this.prisma.club_member_progress.findMany({
        where,
        orderBy: { record_date: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.club_member_progress.count({ where }),
    ]);
    const memberMap = await loadMemberBriefMap(this.prisma, rows.map((r) => r.member_id));
    return paginated(
      rows.map((r) => ({
        id: r.id,
        memberId: r.member_id,
        ...attachMemberBrief(r.member_id, memberMap),
        recordDate: r.record_date,
        weight: r.weight != null ? toNum(r.weight) : null,
        bodyFat: r.body_fat != null ? toNum(r.body_fat) : null,
        muscleMass: r.muscle_mass != null ? toNum(r.muscle_mass) : null,
        measurementsJson: r.measurements_json,
        goals: r.goals,
        notes: r.notes,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
      total,
      q.page,
      q.pageSize,
    );
  }

  async findProgress(id: number, user?: JwtUser) {
    const row = await this.prisma.club_member_progress.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('سجل التقدم غير موجود');
    await this.assertMemberAccess(row.member_id, user);
    const memberMap = await loadMemberBriefMap(this.prisma, [row.member_id]);
    return {
      id: row.id,
      memberId: row.member_id,
      ...attachMemberBrief(row.member_id, memberMap),
      recordDate: row.record_date,
      weight: row.weight != null ? toNum(row.weight) : null,
      bodyFat: row.body_fat != null ? toNum(row.body_fat) : null,
      muscleMass: row.muscle_mass != null ? toNum(row.muscle_mass) : null,
      measurementsJson: row.measurements_json,
      goals: row.goals,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async createProgress(body: Record<string, unknown>, user?: JwtUser) {
    if (!body.memberId || !body.recordDate) {
      throw new BadRequestException('كود العضو وتاريخ السجل مطلوبان');
    }
    await this.assertMemberAccess(Number(body.memberId), user);
    const row = await this.prisma.club_member_progress.create({
      data: {
        member_id: Number(body.memberId),
        record_date: String(body.recordDate),
        weight: body.weight != null ? Number(body.weight) : null,
        body_fat: body.bodyFat != null ? Number(body.bodyFat) : null,
        muscle_mass: body.muscleMass != null ? Number(body.muscleMass) : null,
        measurements_json: (body.measurementsJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        goals: body.goals ? String(body.goals) : null,
        notes: body.notes ? String(body.notes) : null,
      },
    });
    return this.findProgress(row.id, user);
  }

  async updateProgress(id: number, body: Record<string, unknown>, user?: JwtUser) {
    await this.findProgress(id, user);
    if (body.memberId != null) {
      await this.assertMemberAccess(Number(body.memberId), user);
    }
    await this.prisma.club_member_progress.update({
      where: { id },
      data: {
        ...(body.memberId != null ? { member_id: Number(body.memberId) } : {}),
        ...(body.recordDate != null ? { record_date: String(body.recordDate) } : {}),
        ...(body.weight !== undefined ? { weight: body.weight != null ? Number(body.weight) : null } : {}),
        ...(body.bodyFat !== undefined ? { body_fat: body.bodyFat != null ? Number(body.bodyFat) : null } : {}),
        ...(body.muscleMass !== undefined ? { muscle_mass: body.muscleMass != null ? Number(body.muscleMass) : null } : {}),
        ...(body.measurementsJson !== undefined ? { measurements_json: (body.measurementsJson ?? Prisma.JsonNull) as Prisma.InputJsonValue } : {}),
        ...(body.goals !== undefined ? { goals: body.goals ? String(body.goals) : null } : {}),
        ...(body.notes !== undefined ? { notes: body.notes ? String(body.notes) : null } : {}),
      },
    });
    return this.findProgress(id, user);
  }

  async removeProgress(id: number, user?: JwtUser) {
    await this.findProgress(id, user);
    await this.prisma.club_member_progress.delete({ where: { id } });
    return { success: true };
  }

  // --- Physical assessments ---

  async listAssessments(q: ListClubFitnessDto, user?: JwtUser) {
    const where: Prisma.club_physical_assessmentsWhereInput = {};
    if (q.memberId) where.member_id = Number(q.memberId);
    if (q.search?.trim()) {
      const memberIds = await searchMemberIds(this.prisma, q.search);
      if (memberIds.length === 0) {
        return paginated([], 0, q.page, q.pageSize);
      }
      where.member_id = { in: memberIds };
    }
    const scopedIds = await this.allowedMemberIds(user);
    if (scopedIds !== null) where.AND = [{ member_id: { in: scopedIds } }];

    const [rows, total] = await Promise.all([
      this.prisma.club_physical_assessments.findMany({
        where,
        orderBy: { assess_date: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.club_physical_assessments.count({ where }),
    ]);
    const memberMap = await loadMemberBriefMap(this.prisma, rows.map((r) => r.member_id));
    return paginated(
      rows.map((r) => ({
        id: r.id,
        memberId: r.member_id,
        ...attachMemberBrief(r.member_id, memberMap),
        assessDate: r.assess_date,
        assessor: r.assessor,
        scoresJson: r.scores_json,
        notes: r.notes,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
      total,
      q.page,
      q.pageSize,
    );
  }

  async findAssessment(id: number, user?: JwtUser) {
    const row = await this.prisma.club_physical_assessments.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('التقييم البدني غير موجود');
    await this.assertMemberAccess(row.member_id, user);
    const memberMap = await loadMemberBriefMap(this.prisma, [row.member_id]);
    return {
      id: row.id,
      memberId: row.member_id,
      ...attachMemberBrief(row.member_id, memberMap),
      assessDate: row.assess_date,
      assessor: row.assessor,
      scoresJson: row.scores_json,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async createAssessment(body: Record<string, unknown>, user?: JwtUser) {
    if (!body.memberId || !body.assessDate) {
      throw new BadRequestException('كود العضو وتاريخ التقييم مطلوبان');
    }
    await this.assertMemberAccess(Number(body.memberId), user);
    const row = await this.prisma.club_physical_assessments.create({
      data: {
        member_id: Number(body.memberId),
        assess_date: String(body.assessDate),
        assessor: body.assessor ? String(body.assessor) : null,
        scores_json: (body.scoresJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        notes: body.notes ? String(body.notes) : null,
      },
    });
    return this.findAssessment(row.id, user);
  }

  async updateAssessment(id: number, body: Record<string, unknown>, user?: JwtUser) {
    await this.findAssessment(id, user);
    if (body.memberId != null) await this.assertMemberAccess(Number(body.memberId), user);
    await this.prisma.club_physical_assessments.update({
      where: { id },
      data: {
        ...(body.memberId != null ? { member_id: Number(body.memberId) } : {}),
        ...(body.assessDate != null ? { assess_date: String(body.assessDate) } : {}),
        ...(body.assessor !== undefined ? { assessor: body.assessor ? String(body.assessor) : null } : {}),
        ...(body.scoresJson !== undefined ? { scores_json: (body.scoresJson ?? Prisma.JsonNull) as Prisma.InputJsonValue } : {}),
        ...(body.notes !== undefined ? { notes: body.notes ? String(body.notes) : null } : {}),
      },
    });
    return this.findAssessment(id, user);
  }

  async removeAssessment(id: number, user?: JwtUser) {
    await this.findAssessment(id, user);
    await this.prisma.club_physical_assessments.delete({ where: { id } });
    return { success: true };
  }
}

