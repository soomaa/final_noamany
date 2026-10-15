import { exerciseEquipmentIds } from '../club-fitness/equipment-media';
import { standardExercise } from './standard-exercises';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { PrismaService } from "../../common/prisma/prisma.service";
import { BranchScopeService } from "../../common/branch-scope/branch-scope.service";
import { JwtUser } from "../../common/types/jwt-user";
import { MemberJwtUser } from "../../common/types/member-jwt-user";
import * as D from "./training-domain";

export type Actor = JwtUser | MemberJwtUser;
const isMember = (a: Actor): a is MemberJwtUser =>
  "type" in a && a.type === "member";
const canViewSharedPhotos = (a: Actor) =>
  isMember(a) ||
  [1, 3].includes(a.level ?? 0) ||
  (a.is_trainer && a.trainer_id != null);
const author = (a: Actor) => `${isMember(a) ? "member" : "staff"}:${a.sub}`;
const json = (v: unknown) => v as Prisma.InputJsonValue;

@Injectable()
export class TrainingService {
  constructor(
    private readonly db: PrismaService,
    private readonly scope: BranchScopeService,
  ) {}
  async assertAccess(memberId: number, actor: Actor) {
    const member = await this.db.club_members.findFirst({
      where: { id: memberId, is_deleted: false },
      select: { id: true, name: true, branch_id: true },
    });
    if (!member) throw new NotFoundException("العضو غير موجود");
    if (isMember(actor)) {
      if (actor.memberId !== memberId || actor.branchId !== member.branch_id)
        throw new ForbiddenException("لا يمكنك الوصول لهذا الملف");
    } else {
      if (!this.scope.isBranchAllowed(actor, member.branch_id))
        throw new ForbiddenException("العضو خارج نطاق فرعك");
      if (actor.is_trainer && actor.level !== 1 && actor.level !== 3) {
        if (!actor.trainer_id)
          throw new ForbiddenException("الكابتن غير مرتبط بملف مدرب");
        const active = await this.db.training_assignments.findFirst({
          where: { member_id: memberId, is_active: true },
        });
        if (active && active.trainer_id !== actor.trainer_id)
          throw new ForbiddenException("العضو غير مسند إليك");
        if (!active) {
          if (!(await this.linkedTrainerMemberIds(actor)).includes(memberId))
            throw new ForbiddenException("العضو غير مسند إليك");
        }
      }
    }
    return member;
  }
  async linkedTrainerMemberIds(user: JwtUser) {
    if (!user.is_trainer || !user.trainer_id) throw new ForbiddenException("الكابتن غير مرتبط بملف مدرب");
    const today = new Intl.DateTimeFormat("en-CA", {timeZone: "Africa/Cairo"}).format(new Date());
    const [assigned, purchased, memberLinks] = await Promise.all([
      this.db.training_assignments.findMany({where: {trainer_id: user.trainer_id, is_active: true}, select: {member_id: true}}),
      this.db.club_subscriptions.findMany({where: {private_trainer_id: user.trainer_id, status: "active", subscription_start_date: {lte: today}, subscription_end_date: {gte: today}}, select: {member_id: true}}),
      this.db.club_members.findMany({where: {trainer_id: user.trainer_id, is_deleted: false}, select: {id: true}}),
    ]);
    const ids = [...new Set([...assigned.map(r => r.member_id), ...purchased.map(r => r.member_id), ...memberLinks.map(r => r.id)].filter((id): id is number => id != null))];
    // An explicit active plan/handover is authoritative over older roster or purchase links.
    const reassigned = await this.db.training_assignments.findMany({where: {member_id: {in: ids}, is_active: true, OR: [{trainer_id: null}, {trainer_id: {not: user.trainer_id}}]}, select: {member_id: true}});
    const excluded = new Set(reassigned.map(r => r.member_id));
    return ids.filter(id => !excluded.has(id));
  }
  async trainerMembers(user: JwtUser, search = "") {
    const ids = await this.linkedTrainerMemberIds(user);
    const branches = this.scope.allowedBranchIds(user);
    const term = search.trim().slice(0, 150);
    const rows = await this.db.club_members.findMany({where: {
      id: {in: ids}, is_deleted: false,
      ...(branches === null ? {} : {branch_id: {in: branches}}),
      ...(term ? {OR: [{name: {contains: term}}, {member_code: {contains: term}}]} : {}),
    }, select: {id: true, name: true, member_code: true, branch_id: true}, orderBy: {name: "asc"}, take: 100});
    return rows.map(r => ({id: r.id, name: r.name, memberCode: r.member_code, branchId: r.branch_id}));
  }
  async catalog(user?: Actor) {
    const staff = user && !isMember(user) ? user : undefined;
    const branches = user && isMember(user) ? [user.branchId] : this.scope.allowedBranchIds(staff);
    const [club, app, profiles, equipment] = await Promise.all([
      this.db.club_exercises.findMany({
        where: { is_active: true },
        orderBy: { name: "asc" },
        take: 1000,
      }),
      this.db.am_exercises.findMany({
        where: { is_active: true },
        orderBy: { name: "asc" },
        take: 1000,
      }),
      this.db.training_exercise_profiles.findMany({ orderBy: { name: "asc" } }),
      this.db.club_equipment.findMany({ where: { is_active: true, ...(branches === null ? {} : { branch_id: { in: branches } }) }, orderBy: {name: 'asc'}, select: {id:true, name:true, image_url:true, branch_id:true} }),
    ]);
    const map = new Map<string, D.Exercise>();
    for (const e of club)
      map.set(`club:${e.id}`, {
        key: `club:${e.id}`,
        name: e.name,
        ...standardExercise(e.name),
        instructions: e.instructions ?? e.description ?? "",
        videoUrl: null,
      });
    for (const e of app)
      map.set(`app:${e.id}`, {
        key: `app:${e.id}`,
        name: e.name,
        ...standardExercise(e.name),
        instructions: e.instructions ?? e.description ?? "",
        videoUrl: null,
      });
    for (const e of profiles)
      if (e.key.startsWith("custom:") || map.has(e.key))
        map.set(e.key, {
          key: e.key,
          name: e.name,
          kind: e.kind,
          // Preserve configured coach targets; older empty profiles inherit catalog defaults.
          primary: (e.primary_muscles as string[]).length ? e.primary_muscles as string[] : map.get(e.key)?.primary ?? standardExercise(e.name).primary,
          secondary: (e.primary_muscles as string[]).length ? e.secondary_muscles as string[] : ((e.secondary_muscles as string[]).length ? e.secondary_muscles as string[] : map.get(e.key)?.secondary ?? standardExercise(e.name).secondary).filter(m => !(map.get(e.key)?.primary ?? standardExercise(e.name).primary).includes(m)),
          instructions: e.instructions ?? "",
          videoUrl: e.video_url,
          equipmentIds: exerciseEquipmentIds(e.equipment_ids),
          equipment: equipment.filter(item => exerciseEquipmentIds(e.equipment_ids).includes(item.id)).map(item => ({id: item.id, name: item.name, imageUrl: item.image_url, branchId: item.branch_id})),
        });
    return { equipment: equipment.map(item => ({id:item.id, name:item.name, imageUrl:item.image_url, branchId:item.branch_id})), muscles: D.MUSCLES, exercises: [...map.values()].map(e => ({...e, editable: (!user || !isMember(user)) && (!staff?.is_trainer || [1, 3].includes(staff.level ?? 0) || (e.key.startsWith("custom:") && profiles.some(p => p.key === e.key && (p.created_by ?? p.updated_by) === staff.sub)))})) };
  }
  async saveExercise(body: Record<string, unknown>, user: JwtUser) {
    const key = body.key
      ? D.text(body.key, 80, true)
      : `custom:${randomUUID()}`;
    if (!/^(club|app):\d+$|^custom:[a-zA-Z0-9-]+$/.test(key))
      throw new BadRequestException("معرف التمرين غير صالح");
    if (
      body.key &&
      !(await this.catalog(user)).exercises.some((e) => e.key === key)
    )
      throw new NotFoundException("التمرين غير موجود");
    if (body.key && user.is_trainer && ![1, 3].includes(user.level ?? 0)) {
      const profile = await this.db.training_exercise_profiles.findUnique({where: {key}});
      if (!key.startsWith("custom:") || !profile || (profile.created_by ?? profile.updated_by) !== user.sub)
        throw new ForbiddenException("يمكنك تعديل تمارينك الخاصة فقط");
    }
    const kind = D.text(body.kind, 20, true);
    if (!["strength", "timed", "cardio"].includes(kind))
      throw new BadRequestException("نوع التمرين غير صالح");
    const primary = D.muscles(body.primary),
      secondary = D.muscles(body.secondary);
    if (!primary.length) throw new BadRequestException("حدد عضلة أساسية واحدة على الأقل للتمرين");
    if (primary.some((m) => secondary.includes(m)))
      throw new BadRequestException("العضلة الأساسية لا تتكرر كمساعدة");
    const equipmentIds = body.equipmentIds === undefined ? undefined : exerciseEquipmentIds(body.equipmentIds);
    if (equipmentIds?.length) {
      const allowed = this.scope.allowedBranchIds(user);
      const found = await this.db.club_equipment.count({where:{id:{in:equipmentIds},is_active:true,...(allowed === null ? {} : {branch_id:{in:allowed}})}});
      if (found !== equipmentIds.length) throw new ForbiddenException("جهاز غير متاح أو خارج نطاق فرعك");
    }
    const data = {
      name: D.text(body.name, 200, true),
      kind,
      primary_muscles: primary,
      secondary_muscles: secondary,
      instructions: D.text(body.instructions, 5000),
      video_url: D.video(body.videoUrl),
      ...(equipmentIds === undefined ? {} : {equipment_ids: equipmentIds}),
      updated_by: user.sub,
    };
    await this.db.training_exercise_profiles.upsert({
      where: { key },
      create: { key, ...data, created_by: user.sub },
      update: data,
    });
    return { key };
  }
  async trainers(memberId: number, user: JwtUser) {
    const member = await this.assertAccess(memberId, user);
    const employees = await this.db.employees.findMany({
      where: { branch_id_fk: member.branch_id },
      select: { id: true },
    });
    return this.db.club_trainers.findMany({
      where: {
        is_active: true,
        is_deleted: false,
        employee_id: { in: employees.map((e) => e.id) },
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  }
  async plans(user: JwtUser) {
    const scope = this.scope.allowedBranchIds(user);
    return this.db.training_plans.findMany({
      where: {
        ...(scope === null ? {} : { branch_id: { in: scope } }),
        ...(user.is_trainer && user.level !== 1 && user.level !== 3
          ? { OR: [{ created_by: user.sub }, { status: "published" }] }
          : {}),
      },
      orderBy: { updated_at: "desc" },
      take: 100,
    });
  }
  async savePlan(body: Record<string, unknown>, user: JwtUser) {
    const branchId = D.number(
      body.branchId ?? user.branch,
      1,
      2147483647,
      true,
    );
    if (!this.scope.isBranchAllowed(user, branchId))
      throw new ForbiddenException("الفرع خارج نطاقك");
    const status = D.text(body.status, 20, true);
    if (!["draft", "published"].includes(status))
      throw new BadRequestException("حالة البرنامج غير صالحة");
    if (status === "published" && ![1, 3].includes(user.level ?? 0))
      throw new ForbiddenException("اعتماد برنامج للنادي متاح للإدارة فقط");
    const catalog = (await this.catalog(user)).exercises;
    if (
      !Array.isArray(body.days) ||
      body.days.length < 1 ||
      body.days.length > 14
    )
      throw new BadRequestException("أضف من يوم إلى ١٤ يومًا");
    const seen = new Set<string>();
    const days: D.PlanDay[] = body.days.map((raw) => {
      const day = D.object(raw),
        id = D.text(day.id, 80, true);
      if (seen.has(id)) throw new BadRequestException("معرف اليوم مكرر");
      seen.add(id);
      if (
        !Array.isArray(day.exercises) ||
        day.exercises.length < 1 ||
        day.exercises.length > 40
      )
        throw new BadRequestException("أضف تمارين اليوم");
      const exSeen = new Set<string>();
      return {
        id,
        name: D.text(day.name, 150, true),
        reportLocale: D.reportLocale(day.reportLocale),
        exerciseType: D.text(day.exerciseType, 150),
        date: day.date ? D.date(day.date) : null,
        warmup: (() => {
          const warm = day.warmup == null ? {} : D.object(day.warmup);
          return {equipment: D.text(warm.equipment, 250), seconds: D.number(warm.seconds ?? 0, 0, 3600, true), note: D.text(warm.note, 1000)};
        })(),
        exercises: day.exercises.map((rawE) => {
          const e = D.object(rawE),
            exercise = catalog.find((c) => c.key === e.key);
          const rowId = D.text(e.rowId ?? e.key, 80, true);
          if (!exercise || exSeen.has(rowId))
            throw new BadRequestException("تمرين غير موجود أو مكرر في اليوم");
          exSeen.add(rowId);
          if (status === "published" && !exercise.primary.length)
            throw new BadRequestException(
              `حدد العضلات الأساسية للتمرين: ${exercise.name}`,
            );
          return {
            ...exercise,
            equipment: (exercise.equipment ?? []).filter(item => item.branchId === branchId),
            equipmentIds: (exercise.equipment ?? []).filter(item => item.branchId === branchId).map(item => item.id),
            rowId,
            ...D.prescription(e),
            reportName: D.text(e.reportName, 150),
            sets: D.number(e.sets, 1, 30, true),
            reps: D.number(
              e.reps,
              exercise.kind === "strength" ? 1 : 0,
              1000,
              true,
            ),
            seconds: D.number(
              e.seconds,
              exercise.kind !== "strength" ? 1 : 0,
              86400,
              true,
            ),
            rest: D.number(e.rest, 0, 1800, true),
            note: D.text(e.note, 1000),
            coachNote: D.text(e.note, 1000),
          };
        }).sort((a, b) => D.PHASES.indexOf(a.phase!) - D.PHASES.indexOf(b.phase!)),
      };
    });
    const data = {
      name: D.text(body.name, 200, true),
      goal: D.text(body.goal, 500),
      weeks: D.number(body.weeks, 1, 104, true),
      branch_id: branchId,
      status,
      days: json(days),
    };
    if (body.id == null)
      return this.db.training_plans.create({
        data: { ...data, created_by: user.sub },
      });
    const id = D.number(body.id, 1, 2147483647, true),
      revision = D.number(body.revision, 1, 2147483647, true);
    const existing = await this.db.training_plans.findUnique({ where: { id } });
    if (!existing || !this.scope.isBranchAllowed(user, existing.branch_id))
      throw new NotFoundException("البرنامج غير موجود");
    if (
      user.level !== 1 &&
      user.level !== 3 &&
      existing.created_by !== user.sub
    )
      throw new ForbiddenException("لا يمكنك تعديل برنامج كابتن آخر");
    if (existing.status === "published" && ![1, 3].includes(user.level ?? 0))
      throw new ForbiddenException("البرامج المعتمدة تعدلها الإدارة");
    const changed = await this.db.training_plans.updateMany({
      where: { id, revision },
      data: { ...data, revision: { increment: 1 } },
    });
    if (!changed.count)
      throw new ConflictException("البرنامج اتغير؛ أعد تحميله قبل الحفظ");
    return this.db.training_plans.findUnique({ where: { id } });
  }
  async assign(memberId: number, body: Record<string, unknown>, user: JwtUser) {
    const member = await this.assertAccess(memberId, user);
    const plan = await this.db.training_plans.findUnique({
      where: { id: D.number(body.planId, 1, 2147483647, true) },
    });
    if (
      !plan ||
      plan.branch_id !== member.branch_id ||
      (plan.status !== "published" &&
        plan.created_by !== user.sub &&
        user.level !== 1 &&
        user.level !== 3)
    )
      throw new BadRequestException("اختر برنامجًا متاحًا لفرع العضو");
    let trainerId: number | null =
      body.trainerId == null
        ? null
        : D.number(body.trainerId, 1, 2147483647, true);
    if (user.is_trainer && user.level !== 1 && user.level !== 3)
      trainerId = user.trainer_id;
    if (trainerId != null)
      await this.assertTrainer(trainerId, member.branch_id);
    const start = D.date(body.startDate);
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM club_members WHERE id = ${memberId} FOR UPDATE`;
      if (user.is_trainer && ![1, 3].includes(user.level ?? 0)) {
        const current = await tx.training_assignments.findFirst({where: {member_id: memberId, is_active: true}});
        if (current && current.trainer_id !== user.trainer_id) throw new ForbiddenException("العضو غير مسند إليك");
      }
      await tx.training_assignments.updateMany({
        where: { member_id: memberId, is_active: true },
        data: { is_active: false },
      });
      const row = await tx.training_assignments.create({
        data: {
          member_id: memberId,
          trainer_id: trainerId,
          plan_id: plan.id,
          plan_revision: plan.revision,
          snapshot: json({
            name: plan.name,
            goal: plan.goal,
            weeks: plan.weeks,
            days: plan.days,
          }),
          start_date: start,
          created_by: user.sub,
        },
      });
      await tx.training_events.create({
        data: {
          member_id: memberId,
          kind: "plan_assigned",
          note: `${plan.name} · الإصدار ${plan.revision}`,
          author: author(user),
        },
      });
      return row;
    });
  }
  private async assertTrainer(id: number, branch: number) {
    const t = await this.db.club_trainers.findFirst({
      where: { id, is_active: true, is_deleted: false },
      select: { employee_id: true, name: true },
    });
    if (!t?.employee_id)
      throw new BadRequestException("اختر كابتنًا نشطًا مرتبطًا بموظف");
    const emp = await this.db.employees.findUnique({
      where: { id: t.employee_id },
      select: { branch_id_fk: true },
    });
    if (!emp || emp.branch_id_fk !== branch)
      throw new BadRequestException("الكابتن خارج فرع العضو");
    return t;
  }
  async handover(
    memberId: number,
    body: Record<string, unknown>,
    user: JwtUser,
  ) {
    const member = await this.assertAccess(memberId, user);
    const trainerId = D.number(body.trainerId, 1, 2147483647, true);
    const target = await this.assertTrainer(trainerId, member.branch_id);
    const note = D.text(body.note, 3000, true);
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM club_members WHERE id = ${memberId} FOR UPDATE`;
      const assignment = await tx.training_assignments.findFirst({
        where: { member_id: memberId, is_active: true },
      });
      if (!assignment)
        throw new BadRequestException("لا يوجد برنامج فعال لتسليمه");
      if (user.is_trainer && ![1, 3].includes(user.level ?? 0) && assignment.trainer_id !== user.trainer_id)
        throw new ForbiddenException("العضو غير مسند إليك");
      const previous = assignment.trainer_id
        ? await tx.club_trainers.findUnique({
            where: { id: assignment.trainer_id },
            select: { name: true },
          })
        : null;
      await tx.training_assignments.update({
        where: { id: assignment.id },
        data: { trainer_id: trainerId, handover_note: note },
      });
      await tx.training_events.create({
        data: {
          member_id: memberId,
          kind: "coach_handover",
          note: `${previous?.name ?? "بدون كابتن"} ← ${target.name}\n${note}`,
          author: author(user),
        },
      });
      return { ok: true };
    });
  }
  async journey(memberId: number, actor: Actor) {
    const member = await this.assertAccess(memberId, actor);
    const [
      assignment,
      sessionRows,
      photos,
      metrics,
      events,
      bodyCheckins,
      bodyBaseline,
      bodyTarget,
    ] = await Promise.all([
      this.db.training_assignments.findFirst({
        where: { member_id: memberId, is_active: true },
        orderBy: { id: "desc" },
      }),
      this.db.training_sessions.findMany({
        where: { member_id: memberId },
        orderBy: [{ date: "desc" }, { created_at: "desc" }, { id: "desc" }],
        take: 201,
      }),
      canViewSharedPhotos(actor)
        ? this.db.training_photos.findMany({
            where: {
              member_id: memberId,
              ...(isMember(actor) ? {} : { shared_with_coach: true }),
            },
            select: {
              id: true,
              date: true,
              angle: true,
              shared_with_coach: true,
            },
            orderBy: [{ date: "asc" }, { created_at: "asc" }],
          })
        : Promise.resolve([]),
      this.db.training_metrics.findMany({
        where: { member_id: memberId },
        orderBy: { date: "desc" },
      }),
      this.db.training_events.findMany({
        where: {
          member_id: memberId,
          ...(isMember(actor) ? { kind: { not: "coach_handover" } } : {}),
        },
        orderBy: { created_at: "desc" },
        take: 100,
      }),
      this.db.training_body_checkins.findMany({
        where: { member_id: memberId },
        orderBy: [{ date: "desc" }, { created_at: "desc" }, { id: "desc" }],
        take: 100,
      }),
      this.db.training_body_checkins.findFirst({
        where: { member_id: memberId },
        orderBy: [{ date: "asc" }, { created_at: "asc" }, { id: "asc" }],
      }),
      this.db.training_body_targets.findUnique({
        where: { member_id: memberId },
      }),
    ]);
    const sessions = sessionRows.slice(0, 200);
    const nextSessionCursor =
      sessionRows.length > 200 ? sessions.at(-1)!.id : null;
    const trainer = assignment?.trainer_id
      ? await this.db.club_trainers.findUnique({
          where: { id: assignment.trainer_id },
          select: { name: true, id: true },
        })
      : null;
    const counts: Record<string, number> = {};
    for (const s of sessions)
      for (const [id, n] of Object.entries(
        D.heatmap(s.entries as unknown as D.SessionEntry[]),
      ))
        counts[id] = (counts[id] ?? 0) + n;
    return {
      member,
      assignment:
        assignment && isMember(actor)
          ? { ...assignment, handover_note: undefined }
          : assignment,
      trainer,
      sessions,
      photos,
      metrics: metrics.map((m) => ({ ...m, value: Number(m.value) })),
      events,
      muscleSets: counts,
      body: {
        checkins: bodyCheckins,
        baseline: bodyBaseline,
        target: bodyTarget,
      },
      historyLimit: 200,
      nextSessionCursor,
    };
  }
  async olderSessions(memberId: number, cursor: unknown, actor: Actor) {
    await this.assertAccess(memberId, actor);
    const id = D.text(cursor, 80, true);
    const previous = await this.db.training_sessions.findFirst({
      where: { id, member_id: memberId },
      select: { id: true },
    });
    if (!previous) throw new NotFoundException("الحصة غير موجودة");
    const rows = await this.db.training_sessions.findMany({
      where: { member_id: memberId },
      orderBy: [{ date: "desc" }, { created_at: "desc" }, { id: "desc" }],
      cursor: { id },
      skip: 1,
      take: 51,
    });
    const sessions = rows.slice(0, 50);
    return {
      sessions,
      nextCursor: rows.length > 50 ? sessions.at(-1)!.id : null,
    };
  }
  async saveSession(
    memberId: number,
    body: Record<string, unknown>,
    actor: Actor,
  ) {
    await this.assertAccess(memberId, actor);
    const id = D.text(body.id, 80, true);
    if (!/^[a-zA-Z0-9_-]{8,80}$/.test(id))
      throw new BadRequestException("معرف الحصة غير صالح");
    const revision = D.number(body.revision, 0, 2147483646, true);
    const existing = await this.db.training_sessions.findUnique({
      where: { id },
    });
    if (existing && existing.member_id !== memberId)
      throw new ForbiddenException("الحصة تخص عضوًا آخر");
    const assignmentId =
      body.assignmentId == null
        ? null
        : D.number(body.assignmentId, 1, 2147483647, true);
    const assignment =
      assignmentId == null
        ? null
        : await this.db.training_assignments.findFirst({
            where: { id: assignmentId, member_id: memberId },
          });
    if (assignmentId != null && !assignment)
      throw new BadRequestException("الخطة لا تخص العضو");
    if (!existing && assignment && !assignment.is_active)
      throw new ConflictException("الخطة اتغيرت؛ أعد تحميل برنامجك");
    if (!existing && assignment && D.date(body.date) < assignment.start_date)
      throw new BadRequestException("تاريخ الحصة يسبق بداية البرنامج");
    const dayId = D.text(body.dayId, 80) || null;
    const snapshot = assignment?.snapshot as unknown as
      | { days: D.PlanDay[] }
      | undefined;
    const day = snapshot?.days.find((d) => d.id === dayId);
    if (assignment && !day)
      throw new BadRequestException("اليوم غير موجود في البرنامج");
    const catalog = day?.exercises ?? (await this.catalog(actor)).exercises;
    // Existing sessions keep their recorded exercise identities even after catalog edits.
    const exercises = existing
      ? (existing.entries as unknown as D.SessionEntry[])
      : catalog;
    const entries = D.validateEntries(body.entries, exercises);
    if (isMember(actor)) {
      if (!existing && !day) throw new BadRequestException('اختر يومًا من الخطة المسندة لتسجيل المنجز');
      const baseline: D.SessionEntry[] = existing ? existing.entries as unknown as D.SessionEntry[] : day!.exercises.map(e => ({...e, note: '', skipped: false, sets: Array.from({length:e.sets}, () => ({weight:0,reps:e.reps,seconds:e.seconds,done:false}))}));
      D.validateMemberCompletion(entries, baseline);
    }
    const status = D.text(body.status, 20, true);
    if (!["in_progress", "completed"].includes(status))
      throw new BadRequestException("حالة الحصة غير صالحة");
    if (
      status === "completed" &&
      !entries.some((e) => !e.skipped && e.sets.some((s) => s.done))
    )
      throw new BadRequestException(
        "سجل مجموعة واحدة على الأقل قبل إنهاء الحصة",
      );
    if (
      existing &&
      (existing.assignment_id !== assignmentId ||
        existing.day_id !== dayId ||
        existing.date !== body.date)
    )
      throw new BadRequestException("لا يمكن تغيير هوية الحصة");
    const data = {
      member_id: memberId,
      assignment_id: assignmentId,
      day_id: dayId,
      date: D.date(body.date),
      status,
      entries: json(entries),
      note: D.text(body.note, 2000),
      author: author(actor),
    };
    if (!existing) {
      if (revision !== 0)
        throw new ConflictException("الحصة غير موجودة؛ راجع المزامنة");
      try {
        return await this.db.training_sessions.create({
          data: { id, ...data },
        });
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === "P2002"
        )
          throw new ConflictException("الحصة اتسجلت؛ أعد تحميلها");
        throw e;
      }
    }
    const result = await this.db.training_sessions.updateMany({
      where: { id, member_id: memberId, revision },
      data: { ...data, revision: { increment: 1 } },
    });
    if (!result.count)
      throw new ConflictException(
        "الحصة اتعدلت على جهاز آخر؛ راجع النسخة المحفوظة قبل المتابعة",
      );
    return this.db.training_sessions.findUnique({ where: { id } });
  }
  async metric(memberId: number, body: Record<string, unknown>, actor: Actor) {
    await this.assertAccess(memberId, actor);
    const key = D.text(body.testKey, 100, true),
      unit = D.text(body.unit, 30, true),
      protocol = D.text(body.protocol, 500, true),
      side = D.text(body.side ?? "both", 10, true);
    if (!["left", "right", "both"].includes(side))
      throw new BadRequestException("الجانب غير صالح");
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM club_members WHERE id = ${memberId} FOR UPDATE`;
      const old = await tx.training_metrics.findFirst({
        where: { member_id: memberId, test_key: key, side },
      });
      if (old && (old.unit !== unit || old.protocol !== protocol))
        throw new BadRequestException(
          "تغيير الوحدة أو طريقة القياس يتطلب معرف اختبار جديد",
        );
      return tx.training_metrics.create({
        data: {
          member_id: memberId,
          date: D.date(body.date),
          test_key: key,
          label: D.text(body.label, 200, true),
          unit,
          side,
          protocol,
          value: D.number(body.value, 0, 100000),
          author: author(actor),
        },
      });
    });
  }
  async bodyCheckin(
    memberId: number,
    body: Record<string, unknown>,
    actor: Actor,
  ) {
    await this.assertAccess(memberId, actor);
    const id = D.text(body.id, 80, true);
    if (!/^[a-zA-Z0-9_-]{8,80}$/.test(id))
      throw new BadRequestException("معرف القياس غير صالح");
    const measuredDate = D.date(body.date);
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Cairo",
    }).format(new Date());
    if (measuredDate > today)
      throw new BadRequestException("لا يمكن تسجيل قياس في المستقبل");
    const measurements = D.bodyMeasurements(body.measurements);
    const note = D.text(body.note, 1000);
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM club_members WHERE id = ${memberId} FOR UPDATE`;
      const old = await tx.training_body_checkins.findUnique({ where: { id } });
      if (old) {
        const saved = old.measurements as D.BodyMeasurements;
        const same =
          Object.keys(measurements).length === Object.keys(saved).length &&
          Object.entries(measurements).every(
            ([key, value]) => saved[key as keyof D.BodyMeasurements] === value,
          );
        if (
          old.member_id !== memberId ||
          old.date !== measuredDate ||
          old.note !== note ||
          !same
        )
          throw new ConflictException(
            "معرف القياس مستخدم بالفعل؛ أعد تحميل السجل",
          );
        return old;
      }
      return tx.training_body_checkins.create({
        data: {
          id,
          member_id: memberId,
          date: measuredDate,
          measurements: json(measurements),
          note,
          author: author(actor),
        },
      });
    });
  }
  async bodyTarget(
    memberId: number,
    body: Record<string, unknown>,
    actor: Actor,
  ) {
    await this.assertAccess(memberId, actor);
    const measurements = D.bodyMeasurements(body.measurements, true);
    const revision = D.number(body.revision, 0, 1000000, true);
    const targetDate = body.targetDate ? D.date(body.targetDate) : null;
    const targetNote = D.text(body.note, 1000);
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM club_members WHERE id = ${memberId} FOR UPDATE`;
      const old = await tx.training_body_targets.findUnique({
        where: { member_id: memberId },
      });
      if ((old?.revision ?? 0) !== revision) {
        const saved = old?.measurements as D.BodyMeasurements | undefined;
        if (
          old &&
          old.revision === revision + 1 &&
          old.target_date === targetDate &&
          old.note === targetNote &&
          saved &&
          Object.keys(saved).length === Object.keys(measurements).length &&
          Object.entries(measurements).every(
            ([key, value]) => saved[key as keyof D.BodyMeasurements] === value,
          )
        )
          return old;
        throw new ConflictException("الهدف اتعدل؛ أعد تحميله قبل الحفظ");
      }
      const data = {
        measurements: json(measurements),
        target_date: targetDate,
        note: targetNote,
        author: author(actor),
      };
      return old
        ? tx.training_body_targets.update({
            where: { member_id: memberId },
            data: { ...data, revision: { increment: 1 } },
          })
        : tx.training_body_targets.create({
            data: { ...data, member_id: memberId },
          });
    });
  }
  async addPhoto(
    memberId: number,
    body: Record<string, unknown>,
    file: Express.Multer.File,
    actor: MemberJwtUser,
  ) {
    await this.assertAccess(memberId, actor);
    const angle = D.text(body.angle, 20, true);
    if (!["front", "side", "back"].includes(angle))
      throw new BadRequestException("زاوية الصورة غير صالحة");
    if (!file?.buffer || file.size > 3 * 1024 * 1024)
      throw new BadRequestException("اختر صورة حتى ٣ ميجابايت");
    const b = file.buffer;
    const mime =
      b[0] === 255 && b[1] === 216 && b[2] === 255
        ? "image/jpeg"
        : b
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          ? "image/png"
          : b.toString("ascii", 0, 4) === "RIFF" &&
              b.toString("ascii", 8, 12) === "WEBP"
            ? "image/webp"
            : null;
    if (!mime) throw new BadRequestException("الصيغ المتاحة JPEG وPNG وWebP");
    return this.db.training_photos.create({
      data: {
        id: randomUUID(),
        member_id: memberId,
        date: D.date(body.date),
        angle,
        mime,
        content: b,
        shared_with_coach: false,
      },
      select: { id: true, date: true, angle: true, shared_with_coach: true },
    });
  }
  async photo(memberId: number, id: string, actor: Actor) {
    await this.assertAccess(memberId, actor);
    if (!canViewSharedPhotos(actor))
      throw new ForbiddenException(
        "صور التقدم متاحة للكابتن والإدارة بعد موافقة العضو",
      );
    const p = await this.db.training_photos.findFirst({
      where: {
        id,
        member_id: memberId,
        ...(isMember(actor) ? {} : { shared_with_coach: true }),
      },
    });
    if (!p) throw new NotFoundException("الصورة غير متاحة");
    return p;
  }
  async photoConsent(
    memberId: number,
    id: string,
    shared: unknown,
    actor: MemberJwtUser,
  ) {
    await this.assertAccess(memberId, actor);
    if (typeof shared !== "boolean")
      throw new BadRequestException("اختيار المشاركة غير صالح");
    const r = await this.db.training_photos.updateMany({
      where: { id, member_id: memberId },
      data: { shared_with_coach: shared },
    });
    if (!r.count) throw new NotFoundException("الصورة غير موجودة");
    return { ok: true };
  }
  async deletePhoto(memberId: number, id: string, actor: MemberJwtUser) {
    await this.assertAccess(memberId, actor);
    await this.db.training_photos.deleteMany({
      where: { id, member_id: memberId },
    });
    return { ok: true };
  }
}
