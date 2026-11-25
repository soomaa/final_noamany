import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import * as ExcelJS from "exceljs";
import { PrismaService } from "../../common/prisma/prisma.service";
import { BranchScopeService } from "../../common/branch-scope/branch-scope.service";
import { JwtUser } from "../../common/types/jwt-user";
import { paginated } from "../../common/dto/list-result";
import { assertDateOrder } from "../../common/validators";
import { BusinessAuditService } from "../gym-ops/business-audit.service";
import { mapGroupDiscount } from "../club-subscriptions/club-group-discount";
import {
  roundMoney,
  toNum,
} from "../club-subscriptions/club-subscription.utils";
import {
  AssignGroupMembersDto,
  MemberGroupQueryDto,
  UpsertMemberGroupDto,
} from "./dto/member-group.dto";

type Client = PrismaService | Prisma.TransactionClient;

@Injectable()
export class ClubMemberGroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: BranchScopeService,
    private readonly audit: BusinessAuditService,
  ) {}

  private groupScope(user: JwtUser): Prisma.club_member_groupsWhereInput {
    const ids = this.scope.allowedBranchIds(user);
    return ids === null
      ? {}
      : { OR: [{ branch_id: null }, { branch_id: { in: ids } }] };
  }

  private memberScope(user: JwtUser): Prisma.club_membersWhereInput {
    const ids = this.scope.allowedBranchIds(user);
    return {
      is_deleted: false,
      ...(ids === null ? {} : { branch_id: { in: ids } }),
    };
  }

  private subscriptionScope(
    q: MemberGroupQueryDto,
    user: JwtUser,
  ): Prisma.club_subscriptionsWhereInput {
    for (const date of [q.dateFrom, q.dateTo]) {
      if (
        date &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
          !Number.isFinite(new Date(date).getTime()) ||
          new Date(date).toISOString().slice(0, 10) !== date)
      ) {
        throw new BadRequestException("تاريخ التقرير غير صالح");
      }
    }
    if (q.dateFrom && q.dateTo) assertDateOrder(q.dateFrom, q.dateTo);
    const ids = this.scope.allowedBranchIds(user);
    return {
      ...(ids === null ? {} : { branch_id: { in: ids } }),
      ...(q.dateFrom || q.dateTo
        ? {
            registration_date: {
              ...(q.dateFrom ? { gte: q.dateFrom } : {}),
              ...(q.dateTo ? { lte: q.dateTo } : {}),
            },
          }
        : {}),
    };
  }

  private async requireGroup(
    id: number,
    user: JwtUser,
    client: Client = this.prisma,
    mutation = false,
  ) {
    const group = await client.club_member_groups.findFirst({
      where: { id, ...this.groupScope(user) },
    });
    if (!group)
      throw new NotFoundException("المجموعة غير موجودة أو غير متاحة في فروعك");
    if (mutation) {
      if (!group.is_active) throw new BadRequestException("المجموعة مؤرشفة");
      const ids = this.scope.allowedBranchIds(user);
      // Legacy groups had no branch. Do not let one branch change a shared discount for other branches.
      if (
        ids !== null &&
        group.branch_id === null &&
        (await client.club_member_group_members.count({
          where: { group_id: id, member: { branch_id: { notIn: ids } } },
        }))
      )
        throw new ForbiddenException(
          "هذه مجموعة مشتركة بين فروع؛ تعديلها يحتاج صلاحية لجميع فروعها",
        );
    }
    return group;
  }

  async list(
    q: MemberGroupQueryDto,
    user: JwtUser,
    client: Client = this.prisma,
  ) {
    const subscriptionScope = this.subscriptionScope(q, user);
    const rows = await client.club_member_groups.findMany({
      where: {
        ...this.groupScope(user),
        ...(q.includeInactive === "true" ? {} : { is_active: true }),
        ...(q.groupId ? { id: q.groupId } : {}),
        ...(q.search?.trim() ? { name: { contains: q.search.trim() } } : {}),
      },
      include: {
        _count: {
          select: { members: { where: { member: this.memberScope(user) } } },
        },
        plans: { include: { subscription_type: { select: { name: true } } }, orderBy: { id: "asc" } },
      },
      orderBy: [{ is_active: "desc" }, { id: "desc" }],
    });
    const sums = rows.length
      ? await client.club_subscriptions.groupBy({
          by: ["discount_group_id"],
          where: {
            ...subscriptionScope,
            discount_group_id: { in: rows.map((g) => g.id) },
          },
          _count: { id: true },
          _sum: {
            group_discount_value: true,
            subscription_value: true,
            paid_amount: true,
            remaining_amount: true,
          },
        })
      : [];
    const byId = new Map(sums.map((s) => [s.discount_group_id, s]));
    return rows.map((g) => ({
      ...g,
      plans: g.plans.map((plan) => ({
        subscriptionTypeId: plan.subscription_type_id,
        name: plan.subscription_type.name,
        discountType: plan.discount_type,
        discountValue: toNum(plan.discount_value),
      })),
      discount_amount: toNum(g.discount_amount),
      current_members: g._count.members,
      discountedSubscriptions: byId.get(g.id)?._count.id ?? 0,
      totalDiscount: toNum(byId.get(g.id)?._sum.group_discount_value),
      totalGross: toNum(byId.get(g.id)?._sum.subscription_value),
      totalPaid: toNum(byId.get(g.id)?._sum.paid_amount),
      totalRemaining: toNum(byId.get(g.id)?._sum.remaining_amount),
    }));
  }

  /** Validates the group's package list: real packages, sensible discounts, no repeats. */
  private async planValues(dto: UpsertMemberGroupDto, client: Client = this.prisma) {
    if (dto.plans === undefined) return undefined;
    const ids = dto.plans.map((plan) => plan.subscriptionTypeId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException("الباقة مكررة في قائمة باقات المجموعة");
    for (const plan of dto.plans) {
      if (plan.discountValue <= 0) throw new BadRequestException("قيمة خصم الباقة يجب أن تكون أكبر من صفر");
      if (plan.discountType === "percentage" && plan.discountValue > 100) throw new BadRequestException("نسبة خصم الباقة يجب أن تكون من 0 إلى 100");
    }
    if (ids.length) {
      const types = await client.club_subscription_types.findMany({ where: { id: { in: ids } }, select: { id: true, price: true } });
      if (types.length !== ids.length) throw new BadRequestException("بعض الباقات المختارة غير موجودة");
      for (const plan of dto.plans) {
        const type = types.find((row) => row.id === plan.subscriptionTypeId)!;
        if (plan.discountType === "fixed" && plan.discountValue > toNum(type.price))
          throw new BadRequestException("خصم الباقة لا يمكن أن يتجاوز سعرها");
      }
    }
    return dto.plans.map((plan) => ({
      subscription_type_id: plan.subscriptionTypeId,
      discount_type: plan.discountType,
      discount_value: roundMoney(plan.discountValue),
    }));
  }

  private values(dto: UpsertMemberGroupDto) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException("اسم المجموعة مطلوب");
    const type = dto.discountType ?? "none";
    const amount = type === "none" ? 0 : (dto.discountAmount ?? 0);
    if (type !== "none" && amount <= 0)
      throw new BadRequestException("قيمة الخصم يجب أن تكون أكبر من صفر");
    if (type === "percentage" && amount > 100)
      throw new BadRequestException("نسبة الخصم يجب أن تكون من 0 إلى 100");
    return {
      name,
      category: dto.category?.trim() || "عام",
      max_members: dto.maxMembers ?? 0,
      discount_type: type,
      discount_amount: amount,
    };
  }

  async create(dto: UpsertMemberGroupDto, user: JwtUser) {
    const branchId = dto.branchId ?? (user.branch > 0 ? user.branch : null);
    if (branchId && !this.scope.isBranchAllowed(user, branchId))
      throw new ForbiddenException("الفرع غير متاح");
    if (this.scope.allowedBranchIds(user)?.length === 0)
      throw new ForbiddenException("يجب تعيين فرع للمستخدم أولاً");
    const plans = await this.planValues(dto);
    const row = await this.prisma.$transaction(async (tx) => {
      const group = await tx.club_member_groups.create({
        data: { ...this.values(dto), branch_id: branchId },
      });
      if (plans?.length) await tx.club_member_group_plans.createMany({ data: plans.map((plan) => ({ ...plan, group_id: group.id })) });
      return tx.club_member_groups.findUniqueOrThrow({ where: { id: group.id }, include: { plans: true } });
    });
    await this.audit.log({
      entityType: "club_member_group",
      entityId: row.id,
      action: "create",
      actorUserId: user.sub,
      after: row,
    });
    return row;
  }

  async update(id: number, dto: UpsertMemberGroupDto, user: JwtUser) {
    const values = this.values(dto);
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM club_member_groups WHERE id = ${id} FOR UPDATE`;
      await this.requireGroup(id, user, tx, true);
      const plans = await this.planValues(dto, tx);
      const count = await tx.club_member_group_members.count({
        where: { group_id: id, member: { is_deleted: false } },
      });
      if (values.max_members > 0 && values.max_members < count)
        throw new BadRequestException(
          "الحد الأقصى أقل من عدد أعضاء المجموعة الحالي",
        );
      // Only the rule changes. Subscription snapshots, queued renewals, receipts and balances stay immutable.
      if (plans) {
        await tx.club_member_group_plans.deleteMany({ where: { group_id: id } });
        if (plans.length) await tx.club_member_group_plans.createMany({ data: plans.map((plan) => ({ ...plan, group_id: id })) });
      }
      await tx.club_member_groups.update({ where: { id }, data: values });
      return tx.club_member_groups.findUniqueOrThrow({ where: { id }, include: { plans: true } });
    });
    await this.audit.log({
      entityType: "club_member_group",
      entityId: id,
      action: "update",
      actorUserId: user.sub,
      after: row,
    });
    return row;
  }

  async remove(id: number, user: JwtUser) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM club_member_groups WHERE id = ${id} FOR UPDATE`;
      await this.requireGroup(id, user, tx, true);
      await tx.club_member_groups.update({
        where: { id },
        data: { is_active: false },
      });
    });
    await this.audit.log({
      entityType: "club_member_group",
      entityId: id,
      action: "archive",
      actorUserId: user.sub,
    });
    return { ok: true };
  }

  async assign(id: number, dto: AssignGroupMembersDto, user: JwtUser) {
    const ids = [
      ...new Set(dto.memberIds ?? (dto.memberId ? [dto.memberId] : [])),
    ].sort((a, b) => a - b);
    if (!ids.length || ids.length > 200)
      throw new BadRequestException("اختر من 1 إلى 200 عضو في الإضافة الواحدة");
    const added = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM club_member_groups WHERE id = ${id} FOR UPDATE`;
      const group = await this.requireGroup(id, user, tx, true);
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM club_members WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`,
      );
      const members = await tx.club_members.findMany({
        where: { id: { in: ids }, ...this.memberScope(user) },
        select: { id: true, branch_id: true },
      });
      if (members.length !== ids.length)
        throw new ForbiddenException(
          "بعض الأعضاء غير موجودين أو غير متاحين في فروعك",
        );
      if (
        group.branch_id &&
        members.some((m) => m.branch_id !== group.branch_id)
      )
        throw new BadRequestException(
          "يجب أن يكون العضو والمجموعة في نفس الفرع",
        );
      const links = await tx.club_member_group_members.findMany({
        where: { member_id: { in: ids } },
        include: { group: true },
      });
      const conflict = links.find(
        (link) => link.group_id !== id && link.group.is_active,
      );
      if (conflict)
        throw new ConflictException(
          `العضو مرتبط بالفعل بالمجموعة «${conflict.group.name}». أزله منها أولاً`,
        );
      const existingIds = new Set(
        links
          .filter((link) => link.group_id === id)
          .map((link) => link.member_id),
      );
      const newIds = ids.filter((memberId) => !existingIds.has(memberId));
      const count = await tx.club_member_group_members.count({
        where: { group_id: id, member: { is_deleted: false } },
      });
      if (group.max_members > 0 && count + newIds.length > group.max_members)
        throw new BadRequestException(
          "عدد الأعضاء يتجاوز الحد الأقصى للمجموعة",
        );
      await tx.club_member_group_members.deleteMany({
        where: { member_id: { in: newIds }, group_id: { not: id } },
      });
      const employeeNumber = ids.length === 1 && dto.employeeNumber !== undefined ? dto.employeeNumber?.trim() || null : undefined;
      if (newIds.length)
        await tx.club_member_group_members.createMany({
          data: newIds.map((member_id) => ({ group_id: id, member_id, ...(employeeNumber !== undefined ? { employee_number: employeeNumber } : {}) })),
        });
      else if (employeeNumber !== undefined)
        await tx.club_member_group_members.updateMany({ where: { group_id: id, member_id: ids[0] }, data: { employee_number: employeeNumber } });
      await tx.club_member_groups.update({
        where: { id },
        data: { current_members: count + newIds.length },
      });
      return newIds.length;
    });
    await this.audit.log({
      entityType: "club_member_group",
      entityId: id,
      action: "add_members",
      actorUserId: user.sub,
      after: { memberIds: ids, count: added },
    });
    return { ok: true, added };
  }

  async unassign(id: number, memberId: number, user: JwtUser) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM club_member_groups WHERE id = ${id} FOR UPDATE`;
      await this.requireGroup(id, user, tx, true);
      await tx.$queryRaw`SELECT id FROM club_members WHERE id = ${memberId} FOR UPDATE`;
      const member = await tx.club_members.findFirst({
        where: { id: memberId, ...this.memberScope(user) },
      });
      if (!member) throw new ForbiddenException("العضو غير متاح في فروعك");
      await tx.club_member_group_members.deleteMany({
        where: { group_id: id, member_id: memberId },
      });
      const count = await tx.club_member_group_members.count({
        where: { group_id: id, member: { is_deleted: false } },
      });
      await tx.club_member_groups.update({
        where: { id },
        data: { current_members: count },
      });
    });
    await this.audit.log({
      entityType: "club_member_group",
      entityId: id,
      action: "remove_member",
      actorUserId: user.sub,
      after: { memberId },
    });
    return { ok: true };
  }

  async members(
    id: number,
    q: MemberGroupQueryDto,
    user: JwtUser,
    client: Client = this.prisma,
  ) {
    await this.requireGroup(id, user, client);
    const s = q.search?.trim();
    const where: Prisma.club_member_group_membersWhereInput = {
      group_id: id,
      member: {
        ...this.memberScope(user),
        ...(s
          ? {
              OR: [
                { member_code: { contains: s } },
                { name: { contains: s } },
                { phone: { contains: s } },
                { card_number: { contains: s } },
              ],
            }
          : {}),
      },
    };
    const [rows, total] = await Promise.all([
      client.club_member_group_members.findMany({
        where,
        include: { member: true },
        orderBy: { id: "desc" },
        skip: q.skip,
        take: q.take,
      }),
      client.club_member_group_members.count({ where }),
    ]);
    return paginated(
      rows.map((r) => ({
        id: r.member.id,
        memberCode: r.member.member_code,
        name: r.member.name,
        phone: r.member.phone,
        cardNumber: r.member.card_number,
        email: r.member.email,
        gender: r.member.gender,
        branchId: r.member.branch_id,
        address: r.member.address,
        maritalStatus: r.member.marital_status,
        jobTitle: r.member.job_title,
        membershipTypeId: r.member.membership_type_id,
        startDate: r.member.start_date,
        endDate: r.member.end_date,
        blockReason: r.member.block_reason,
        salesId: r.member.sales_id,
        employeeId: r.member.employee_id,
        dateOfBirth: r.member.date_of_birth,
        guardianName: r.member.guardian_name,
        guardianPhone: r.member.guardian_phone,
        isActive: r.member.is_active,
        isBlocked: r.member.is_blocked,
        notes: r.member.notes,
        groupEmployeeNumber: r.employee_number,
        joinedAt: r.created_at,
        createdAt: r.member.created_at,
        updatedAt: r.member.updated_at,
      })),
      total,
      q.page,
      q.pageSize,
    );
  }

  async discounts(
    id: number,
    q: MemberGroupQueryDto,
    user: JwtUser,
    client: Client = this.prisma,
  ) {
    await this.requireGroup(id, user, client);
    const where = { ...this.subscriptionScope(q, user), discount_group_id: id };
    const [rows, total] = await Promise.all([
      client.club_subscriptions.findMany({
        where,
        include: {
          member: { select: { member_code: true, name: true, phone: true } },
        },
        orderBy: { id: "desc" },
        skip: q.skip,
        take: q.take,
      }),
      client.club_subscriptions.count({ where }),
    ]);
    return paginated(
      rows.map((r) => ({
        id: r.id,
        subscriptionNumber: r.subscription_number,
        memberId: r.member_id,
        memberCode: r.member?.member_code ?? null,
        memberName: r.customer_name ?? r.member?.name,
        phone: r.member?.phone,
        branchId: r.branch_id,
        subscriptionType: r.subscription_type,
        registrationDate: r.registration_date,
        startDate: r.subscription_start_date,
        endDate: r.subscription_end_date,
        status: r.status,
        groupDiscount: mapGroupDiscount(r),
        grossValue: toNum(r.subscription_value),
        discountValue: toNum(r.group_discount_value),
        netValue: roundMoney(
          toNum(r.subscription_value) - toNum(r.discount_value),
        ),
        paidAmount: toNum(r.paid_amount),
        remainingAmount: toNum(r.remaining_amount),
        renewedFromSubscriptionId: r.renewed_from_subscription_id,
      })),
      total,
      q.page,
      q.pageSize,
    );
  }

  async export(q: MemberGroupQueryDto, user: JwtUser) {
    const buffer = await this.prisma.$transaction(
      async (client) => {
        const groups = await this.list(q, user, client);
        const workbook = new ExcelJS.Workbook();
        const addSheet = (name: string, columns: Array<[string, string]>) => {
          const sheet = workbook.addWorksheet(name, {
            views: [{ rightToLeft: true }],
          });
          sheet.columns = columns.map(([key, header]) => ({
            key,
            header,
            width: 24,
          }));
          sheet.getRow(1).font = { bold: true };
          sheet.views = [{ rightToLeft: true, state: "frozen", ySplit: 1 }];
          sheet.autoFilter = {
            from: "A1",
            to: { row: 1, column: columns.length },
          };
          return sheet;
        };
        const summary = addSheet("المجموعات", [
          ["id", "رقم المجموعة"],
          ["name", "اسم المجموعة"],
          ["category", "التصنيف"],
          ["branch_id", "رقم الفرع"],
          ["is_active", "مفعلة"],
          ["discount_type", "نوع الخصم"],
          ["discount_amount", "القاعدة الحالية"],
          ["current_members", "عدد الأعضاء الحالي"],
          ["discountedSubscriptions", "عدد الاشتراكات"],
          ["totalDiscount", "إجمالي خصومات الفترة بالجنيه"],
          ["totalGross", "إجمالي قيمة الاشتراكات"],
          ["totalPaid", "المدفوع"],
          ["totalRemaining", "المتبقي"],
          ["dateFrom", "بداية فترة التقرير"],
          ["dateTo", "نهاية فترة التقرير"],
        ]);
        const members = addSheet("الأعضاء", [
          ["groupName", "المجموعة"],
          ["id", "رقم العضو الداخلي"],
          ["memberCode", "كود العضو"],
          ["name", "الاسم"],
          ["phone", "الموبايل"],
          ["cardNumber", "الرقم القومي"],
          ["email", "البريد الإلكتروني"],
          ["gender", "النوع"],
          ["branchId", "رقم الفرع"],
          ["dateOfBirth", "تاريخ الميلاد"],
          ["address", "العنوان"],
          ["maritalStatus", "الحالة الاجتماعية"],
          ["jobTitle", "الوظيفة"],
          ["membershipTypeId", "رقم نوع العضوية"],
          ["startDate", "بداية العضوية"],
          ["endDate", "نهاية العضوية"],
          ["guardianName", "ولي الأمر"],
          ["guardianPhone", "هاتف ولي الأمر"],
          ["isActive", "عضو نشط"],
          ["isBlocked", "محظور"],
          ["blockReason", "سبب الحظر"],
          ["salesId", "مسؤول المبيعات"],
          ["employeeId", "الموظف المرتبط"],
          ["joinedAt", "تاريخ الإضافة للمجموعة"],
          ["createdAt", "تاريخ إنشاء العضو"],
          ["updatedAt", "آخر تعديل للعضو"],
          ["notes", "ملاحظات العضو"],
        ]);
        const discounts = addSheet("خصومات الاشتراكات", [
          ["groupName", "المجموعة وقت الاشتراك"],
          ["subscriptionNumber", "رقم الاشتراك"],
          ["memberCode", "كود العضو"],
          ["memberName", "اسم العضو"],
          ["phone", "الموبايل"],
          ["branchId", "رقم الفرع"],
          ["subscriptionType", "الباقة"],
          ["registrationDate", "تاريخ التسجيل"],
          ["startDate", "البداية"],
          ["endDate", "النهاية"],
          ["discountType", "نوع الخصم المحفوظ"],
          ["discountRate", "القاعدة وقت الاشتراك"],
          ["grossValue", "القيمة قبل الخصم"],
          ["discountValue", "خصم المجموعة الفعلي بالجنيه"],
          ["netValue", "الصافي"],
          ["paidAmount", "المدفوع"],
          ["remainingAmount", "المتبقي"],
          ["status", "الحالة"],
          ["renewedFromSubscriptionId", "تجديد للاشتراك"],
        ]);
        for (const group of groups) {
          summary.addRow({
            ...group,
            dateFrom: q.dateFrom ?? "كل التواريخ",
            dateTo: q.dateTo ?? "كل التواريخ",
          });
          for (const [kind, sheet] of [
            ["members", members],
            ["discounts", discounts],
          ] as const) {
            let page = 1;
            while (true) {
              const query = Object.assign(new MemberGroupQueryDto(), q, {
                page,
                pageSize: 500,
                search: undefined,
              });
              const result =
                kind === "members"
                  ? await this.members(group.id, query, user, client)
                  : await this.discounts(group.id, query, user, client);
              for (const row of result.data) {
                const discount =
                  "groupDiscount" in row ? row.groupDiscount : null;
                sheet.addRow({
                  ...row,
                  groupName: discount?.name ?? group.name,
                  discountType: discount?.discountType,
                  discountRate: discount?.discountAmount,
                });
              }
              if (page * 500 >= result.total) break;
              page++;
            }
          }
        }
        return workbook.xlsx.writeBuffer();
      },
      {
        maxWait: 10000,
        timeout: 60000,
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      },
    );
    await this.audit.log({
      entityType: "club_member_group",
      entityId: q.groupId ?? "all",
      action: "export",
      actorUserId: user.sub,
    });
    return buffer;
  }
}
