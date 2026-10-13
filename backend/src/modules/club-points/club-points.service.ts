import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

export type PointsConversion = {
  points: number;
  value: number;
  validityDays: number;
};

export type EarnedPoints = {
  points: number;
  active: boolean;
  expiresOn: string;
};

type PointsDbClient = Pick<PrismaService, '$queryRaw' | '$executeRaw'>;

@Injectable()
export class ClubPointsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The points balance is derived from valid, activated earn rows minus all
   * exhausted rows. It deliberately never returns a negative balance.
   */
  calculateBalance(input: {
    earned: EarnedPoints[];
    exhaustedPoints: number;
    today: string;
  }): number {
    const earned = input.earned
      .filter((row) => row.active && row.expiresOn >= input.today)
      .reduce((sum, row) => sum + row.points, 0);
    return Math.max(0, earned - input.exhaustedPoints);
  }

  /**
   * Quotes a points redemption. The quote is also the rule used later when
   * persisting the redemption; clients may not combine it with another discount.
   */
  quoteRedemption(input: {
    availablePoints: number;
    requestedPoints: number;
    subscriptionValue: number;
    conversion: PointsConversion;
    hasOtherDiscount?: boolean;
  }): { points: number; value: number } {
    if (input.hasOtherDiscount) {
      throw new BadRequestException('لا يمكن جمع خصم النقاط مع أي خصم آخر');
    }
    if (!Number.isInteger(input.requestedPoints) || input.requestedPoints <= 0) {
      throw new BadRequestException('عدد النقاط المطلوب غير صالح');
    }
    if (input.requestedPoints > input.availablePoints) {
      throw new BadRequestException('رصيد النقاط غير كافٍ');
    }
    if (input.conversion.points <= 0 || input.conversion.value < 0) {
      throw new BadRequestException('إعداد تحويل النقاط غير صالح');
    }

    const value = Number(((input.requestedPoints / input.conversion.points) * input.conversion.value).toFixed(2));
    if (value > input.subscriptionValue) {
      throw new BadRequestException('خصم النقاط لا يمكن أن يتجاوز قيمة الاشتراك');
    }
    return { points: input.requestedPoints, value };
  }

  private today() {
    return new Date().toISOString().slice(0, 10);
  }

  private addDays(date: string, days: number) {
    const value = new Date(`${date}T00:00:00.000Z`);
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
  }

  private assertDateRange(fromDate: string, toDate: string) {
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!datePattern.test(fromDate) || !datePattern.test(toDate) || fromDate > toDate) {
      throw new BadRequestException('نطاق التاريخ غير صالح');
    }
  }

  async conversion() {
    return this.conversionFor(this.prisma);
  }

  private async conversionFor(client: PointsDbClient) {
    const rows = await client.$queryRaw<Array<{
      id: number; points: number; value: number; validity_days: number;
    }>>(Prisma.sql`SELECT id, points, value, validity_days FROM tbl_convert_points_setting ORDER BY id ASC LIMIT 1`);
    const row = rows[0] ?? null;
    return row
      ? { id: row.id, points: row.points, value: Number(row.value), validityDays: row.validity_days }
      : null;
  }

  async saveConversion(input: PointsConversion, publisher: number) {
    if (!Number.isInteger(input.points) || input.points <= 0 || !Number.isFinite(input.value) || input.value < 0) {
      throw new BadRequestException('إعداد تحويل النقاط غير صالح');
    }
    if (!Number.isInteger(input.validityDays) || input.validityDays < 1) {
      throw new BadRequestException('مدة صلاحية النقاط غير صالحة');
    }
    const current = await this.conversion();
    const now = this.today();
    if (current) {
      await this.prisma.$executeRaw(Prisma.sql`
        UPDATE tbl_convert_points_setting
        SET points=${input.points}, value=${input.value}, validity_days=${input.validityDays}, date=${now}, publisher=${publisher}
        WHERE id=${current.id}`);
      return { ...input, id: current.id };
    }
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO tbl_convert_points_setting (points, value, validity_days, date, publisher)
      VALUES (${input.points}, ${input.value}, ${input.validityDays}, ${now}, ${publisher})`);
    const created = await this.conversion();
    return { ...input, id: created?.id ?? null };
  }

  async listEarnSettings() {
    const rows = await this.prisma.$queryRaw<Array<{
      id: number; type: number; points: number; expire_days: number;
    }>>(Prisma.sql`SELECT id, type, points, expire_days FROM tbl_points_setting ORDER BY id ASC`);
    return rows.map((row) => ({ id: row.id, type: row.type, points: row.points, expireDays: row.expire_days }));
  }

  async saveEarnSetting(input: { type: number; points: number; expireDays: number }, publisher: number) {
    if (!Number.isInteger(input.type) || !Number.isInteger(input.points) || input.points < 0 || !Number.isInteger(input.expireDays) || input.expireDays < 0) {
      throw new BadRequestException('إعداد تجميع النقاط غير صالح');
    }
    const existing = await this.prisma.$queryRaw<Array<{ id: number }>>(Prisma.sql`
      SELECT id FROM tbl_points_setting WHERE type=${input.type} LIMIT 1`);
    if (existing.length) throw new BadRequestException('تم إعداد هذا النوع من النقاط بالفعل');
    const now = this.today();
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO tbl_points_setting (type, points, expire_days, date, publisher)
      VALUES (${input.type}, ${input.points}, ${input.expireDays}, ${now}, ${publisher})`);
    return this.listEarnSettings();
  }

  async updateEarnSetting(id: number, input: { points: number; expireDays: number }, publisher: number) {
    if (!Number.isInteger(id) || id < 1 || !Number.isInteger(input.points) || input.points < 0 || !Number.isInteger(input.expireDays) || input.expireDays < 0) {
      throw new BadRequestException('إعداد تجميع النقاط غير صالح');
    }
    const result = await this.prisma.$executeRaw(Prisma.sql`
      UPDATE tbl_points_setting
      SET points=${input.points}, expire_days=${input.expireDays}, date=${this.today()}, publisher=${publisher}
      WHERE id=${id}`);
    if (Number(result) === 0) throw new NotFoundException('إعداد تجميع النقاط غير موجود');
    return this.listEarnSettings();
  }

  async deleteEarnSetting(id: number) {
    if (!Number.isInteger(id) || id < 1) throw new BadRequestException('إعداد تجميع النقاط غير صالح');
    const result = await this.prisma.$executeRaw(Prisma.sql`DELETE FROM tbl_points_setting WHERE id=${id}`);
    if (Number(result) === 0) throw new NotFoundException('إعداد تجميع النقاط غير موجود');
    return { ok: true };
  }

  async memberAccount(memberId: number) {
    const members = await this.prisma.$queryRaw<Array<{ id: number; member_code: string | null }>>(
      Prisma.sql`SELECT id, member_code FROM club_members WHERE id=${memberId} AND is_deleted=0 LIMIT 1`,
    );
    const member = members[0];
    if (!member) throw new NotFoundException('العضو غير موجود');
    const today = this.today();
    const [earned, exhausted] = await Promise.all([
      this.prisma.$queryRaw<Array<{ points: number; is_active: boolean; deadline_date: string | null }>>(Prisma.sql`
        SELECT points, is_active, deadline_date FROM tbl_points_history
        WHERE member_id=${memberId} AND deleted=0`),
      this.prisma.$queryRaw<Array<{ total: number | null }>>(Prisma.sql`
        SELECT COALESCE(SUM(points), 0) AS total FROM tbl_points_exhausted_history
        WHERE member_id=${memberId} AND deleted=0`),
    ]);
    const balance = this.calculateBalance({
      earned: earned.map((row) => ({
        points: Number(row.points), active: Boolean(row.is_active), expiresOn: row.deadline_date ?? '',
      })),
      exhaustedPoints: Number(exhausted[0]?.total ?? 0),
      today,
    });
    const conversion = await this.conversion();
    const value = conversion && conversion.points > 0
      ? Number(((balance / conversion.points) * conversion.value).toFixed(2))
      : 0;
    return { memberId, memberCode: member.member_code, points: balance, value, conversion };
  }

  async history(memberId: number) {
    const account = await this.memberAccount(memberId);
    const rows = await this.prisma.$queryRaw<Array<{
      id: number; direction: string; points: number; value: number | null; action: string | null;
      occurred_on: string | null; expires_on: string | null; subscription_id: number | null;
    }>>(Prisma.sql`
      SELECT id, 'earn' AS direction, points, NULL AS value, action_name AS action,
             date AS occurred_on, deadline_date AS expires_on, sub_id_fk AS subscription_id
      FROM tbl_points_history WHERE member_id=${memberId} AND deleted=0
      UNION ALL
      SELECT id, 'redeem' AS direction, points, points_value AS value, sub_type AS action,
             date AS occurred_on, NULL AS expires_on, sub_id_fk AS subscription_id
      FROM tbl_points_exhausted_history WHERE member_id=${memberId} AND deleted=0
      ORDER BY occurred_on DESC, id DESC`);
    return {
      ...account,
      history: rows.map((row) => ({
        id: row.id, type: row.direction, points: Number(row.points), value: row.value == null ? null : Number(row.value),
        action: row.action, occurredOn: row.occurred_on, expiresOn: row.expires_on, subscriptionId: row.subscription_id,
      })),
    };
  }

  async activeMembersReport() {
    const today = this.today();
    const rows = await this.prisma.$queryRaw<Array<{ member_id: number; member_code: string | null; earned: number; exhausted: number }>>(Prisma.sql`
      SELECT h.member_id, MAX(h.member_code) AS member_code, SUM(h.points) AS earned,
        COALESCE((SELECT SUM(e.points) FROM tbl_points_exhausted_history e WHERE e.member_id=h.member_id AND e.deleted=0),0) AS exhausted
      FROM tbl_points_history h WHERE h.deleted=0 AND h.is_active=1 AND h.deadline_date >= ${today}
      GROUP BY h.member_id HAVING SUM(h.points) > COALESCE((SELECT SUM(e.points) FROM tbl_points_exhausted_history e WHERE e.member_id=h.member_id AND e.deleted=0),0)`);
    const conversion = await this.conversion();
    return rows.map((row) => {
      const points = Math.max(0, Number(row.earned) - Number(row.exhausted));
      return { memberId: row.member_id, memberCode: row.member_code, points, value: conversion ? Number(((points / conversion.points) * conversion.value).toFixed(2)) : 0 };
    });
  }

  async memberHistoryByCode(memberCode: string) {
    const members = await this.prisma.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`SELECT id FROM club_members WHERE member_code=${memberCode.trim()} AND is_deleted=0 LIMIT 1`,
    );
    if (!members[0]) throw new NotFoundException('العضو غير موجود');
    return this.history(members[0].id);
  }

  async earnedMembersReport(fromDate: string, toDate: string) {
    this.assertDateRange(fromDate, toDate);
    const rows = await this.prisma.$queryRaw<Array<{
      member_id: number | null; member_code: string | null; member_name: string | null; points: number;
    }>>(Prisma.sql`
      SELECT h.member_id, MAX(h.member_code) AS member_code, MAX(m.name) AS member_name, SUM(h.points) AS points
      FROM tbl_points_history h
      LEFT JOIN club_members m ON m.id=h.member_id
      WHERE h.deleted=0 AND h.date >= ${fromDate} AND h.date <= ${toDate}
      GROUP BY h.member_id
      ORDER BY member_name ASC, member_code ASC`);
    return rows.map((row) => ({
      memberId: row.member_id,
      memberCode: row.member_code,
      memberName: row.member_name,
      points: Number(row.points),
    }));
  }

  async recordEarnedForSubscription(input: {
    memberId: number; memberCode: string | null; subscriptionId: number; subscriptionTypeId: number | null;
    subscriptionTypeName: string | null; points: number; publisher: number;
  }, client: PointsDbClient = this.prisma) {
    if (!Number.isInteger(input.points) || input.points <= 0) return null;
    const conversion = await this.conversionFor(client);
    if (!conversion) return null;
    const now = this.today();
    const expiry = this.addDays(now, conversion.validityDays);
    await client.$executeRaw(Prisma.sql`
      INSERT INTO tbl_points_history
      (type, member_id, member_code, action_type, action_name, subscription_type_id_fk, subscription_type_n, points, date_added, deadline_date, deadline_date_string, date, publisher, sub_id_fk, deleted, is_active)
      VALUES ('increase', ${input.memberId}, ${input.memberCode}, 4, 'اضافة اشتراك من النظام', ${input.subscriptionTypeId}, ${input.subscriptionTypeName}, ${input.points}, ${now}, ${expiry}, ${expiry}, ${now}, ${input.publisher}, ${input.subscriptionId}, false, true)`);
    return { points: input.points, expiresOn: expiry };
  }

  /**
   * Persists a redemption while the subscription transaction holds the member
   * row lock. This makes the available-balance check and consumed-points row
   * one atomic operation, rather than trusting a quote produced by the UI.
   */
  async redeemForSubscription(input: {
    memberId: number;
    memberCode: string | null;
    subscriptionId: number;
    subscriptionTypeId: number | null;
    subscriptionTypeName: string | null;
    requestedPoints: number;
    subscriptionValue: number;
    publisher: number;
  }, client: PointsDbClient): Promise<{ points: number; value: number }> {
    await client.$queryRaw(Prisma.sql`SELECT id FROM club_members WHERE id=${input.memberId} FOR UPDATE`);
    const today = this.today();
    const [earned, exhausted, conversionRows] = await Promise.all([
      client.$queryRaw<Array<{ points: number; is_active: boolean; deadline_date: string | null }>>(Prisma.sql`
        SELECT points, is_active, deadline_date FROM tbl_points_history
        WHERE member_id=${input.memberId} AND deleted=0 FOR UPDATE`),
      client.$queryRaw<Array<{ points: number }>>(Prisma.sql`
        SELECT points FROM tbl_points_exhausted_history
        WHERE member_id=${input.memberId} AND deleted=0 FOR UPDATE`),
      client.$queryRaw<Array<{ points: number; value: number; validity_days: number }>>(Prisma.sql`
        SELECT points, value, validity_days FROM tbl_convert_points_setting ORDER BY id ASC LIMIT 1`),
    ]);
    const conversion = conversionRows[0];
    if (!conversion) throw new BadRequestException('إعداد تحويل النقاط غير موجود');
    const availablePoints = this.calculateBalance({
      earned: earned.map((row) => ({
        points: Number(row.points), active: Boolean(row.is_active), expiresOn: row.deadline_date ?? '',
      })),
      exhaustedPoints: exhausted.reduce((sum, row) => sum + Number(row.points), 0),
      today,
    });
    const quote = this.quoteRedemption({
      availablePoints,
      requestedPoints: input.requestedPoints,
      subscriptionValue: input.subscriptionValue,
      conversion: {
        points: Number(conversion.points), value: Number(conversion.value), validityDays: Number(conversion.validity_days),
      },
    });
    await client.$executeRaw(Prisma.sql`
      INSERT INTO tbl_points_exhausted_history
      (member_id, member_code, sub_id_fk, sub_type, points, points_value, date, publisher, subscription_type_id_fk, subscription_type_n, deleted)
      VALUES (${input.memberId}, ${input.memberCode}, ${input.subscriptionId}, ${input.subscriptionTypeName}, ${quote.points}, ${quote.value}, ${today}, ${input.publisher}, ${input.subscriptionTypeId}, ${input.subscriptionTypeName}, false)`);
    return quote;
  }
}
