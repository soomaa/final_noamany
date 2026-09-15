import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { paginated } from '../../common/dto/list-result';
import { BusinessAuditService } from '../gym-ops/business-audit.service';
import { EntitlementService } from '../gym-ops/entitlement.service';
import { ClubMembersService } from '../club-members/club-members.service';
import { ModuleLedgerService } from '../accounting/module-ledger.service';
import { ListClubEventRegistrationsDto } from './dto/list-club-event-registrations.dto';
import { RegisterClubEventDto } from './dto/register-club-event.dto';
import { PayClubEventRegistrationDto } from './dto/pay-club-event-registration.dto';
import { RefundClubEventRegistrationDto } from './dto/refund-club-event-registration.dto';
import { PatchClubEventRegistrationDto } from './dto/patch-club-event-registration.dto';
import { genCheckinCode, localDateString, roundMoney, toNum } from './club-events.utils';
import { attachMemberBrief, loadMemberBriefMap, searchMemberIds } from '../club-members/club-member-brief.utils';

type Tx = Prisma.TransactionClient;

export type ClubEventRegisterOptions = {
  /** Walk-in via live kiosk / QR — relaxes status + guest flags and auto-confirms. */
  liveSelfCheckin?: boolean;
};

const LIVE_SELF_CHECKIN_STATUSES = ['approved', 'published', 'ongoing'] as const;
const STANDARD_REGISTER_STATUSES = ['published', 'ongoing'] as const;

const registrationInclude = {
  payments: { orderBy: { id: 'asc' as const } },
  checkins: { orderBy: { id: 'asc' as const } },
};

/** True when a P2002 unique violation came from a constraint/index whose name contains `needle`. */
function isUniqueTarget(e: Prisma.PrismaClientKnownRequestError, needle: string): boolean {
  const target = (e.meta as { target?: string | string[] } | undefined)?.target;
  const text = Array.isArray(target) ? target.join(',') : String(target ?? '');
  return text.toLowerCase().includes(needle.toLowerCase());
}

@Injectable()
export class ClubEventRegistrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly members: ClubMembersService,
    private readonly entitlement: EntitlementService,
    private readonly moduleLedger: ModuleLedgerService,
    private readonly audit: BusinessAuditService,
  ) {}

  private mapPayment(p: {
    id: number;
    payment_number: string;
    registration_id: number;
    event_id: number;
    branch_id: number;
    type: string;
    amount: Prisma.Decimal;
    payment_method: string | null;
    payment_date: string;
    status: string;
    refund_of_id: number | null;
    idempotency_key: string | null;
    description: string | null;
    created_by: number | null;
    created_at: Date;
  }) {
    return {
      id: p.id,
      paymentNumber: p.payment_number,
      registrationId: p.registration_id,
      eventId: p.event_id,
      branchId: p.branch_id,
      type: p.type,
      amount: toNum(p.amount),
      paymentMethod: p.payment_method,
      paymentDate: p.payment_date,
      status: p.status,
      refundOfId: p.refund_of_id,
      description: p.description,
      createdBy: p.created_by,
      createdAt: p.created_at,
    };
  }

  private mapCheckin(c: {
    id: number;
    registration_id: number;
    event_id: number;
    session_id: number | null;
    method: string;
    checked_in_at: Date;
    checked_by: number | null;
  }) {
    return {
      id: c.id,
      registrationId: c.registration_id,
      eventId: c.event_id,
      sessionId: c.session_id,
      method: c.method,
      checkedInAt: c.checked_in_at,
      checkedBy: c.checked_by,
    };
  }

  private mapRegistration(
    row: Prisma.club_event_registrationsGetPayload<{ include: typeof registrationInclude }>,
    memberMap: Map<number, import('../club-members/club-member-brief.utils').MemberBrief>,
  ) {
    return {
      id: row.id,
      registrationNumber: row.registration_number,
      eventId: row.event_id,
      sessionId: row.session_id,
      tierId: row.tier_id,
      registrantType: row.registrant_type,
      memberId: row.member_id,
      ...attachMemberBrief(row.member_id, memberMap),
      guestName: row.guest_name,
      guestPhone: row.guest_phone,
      guestEmail: row.guest_email,
      leadSource: row.lead_source,
      convertedMemberId: row.converted_member_id,
      branchId: row.branch_id,
      status: row.status,
      waitlistPosition: row.waitlist_position,
      holdExpiresAt: row.hold_expires_at,
      price: toNum(row.price),
      discountValue: toNum(row.discount_value),
      paidAmount: toNum(row.paid_amount),
      checkinCode: row.checkin_code,
      participantDob: row.participant_dob,
      guardianName: row.guardian_name,
      guardianPhone: row.guardian_phone,
      guardianRelation: row.guardian_relation,
      consentSigned: row.consent_signed,
      consentFile: row.consent_file,
      emergencyPhone: row.emergency_phone,
      channel: row.channel,
      noShow: row.no_show,
      notes: row.notes,
      cancelledAt: row.cancelled_at,
      cancelReason: row.cancel_reason,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      payments: row.payments.map((p) => this.mapPayment(p)),
      checkins: row.checkins.map((c) => this.mapCheckin(c)),
    };
  }

  async list(q: ListClubEventRegistrationsDto) {
    const and: Prisma.club_event_registrationsWhereInput[] = [{ is_deleted: false }];

    if (q.eventId) and.push({ event_id: Number(q.eventId) });
    if (q.status && q.status !== 'all') and.push({ status: q.status as never });
    if (q.registrantType) and.push({ registrant_type: q.registrantType as never });
    if (q.branch && q.branch !== 'all') and.push({ branch_id: Number(q.branch) });
    if (q.search?.trim()) {
      const s = q.search.trim();
      const memberIds = await searchMemberIds(this.prisma, s);
      and.push({
        OR: [
          { registration_number: { contains: s } },
          { guest_name: { contains: s } },
          { guest_phone: { contains: s } },
          ...(memberIds.length ? [{ member_id: { in: memberIds } }] : []),
        ],
      });
    }

    const where: Prisma.club_event_registrationsWhereInput = { AND: and };

    const [rows, total] = await Promise.all([
      this.prisma.club_event_registrations.findMany({
        where,
        include: registrationInclude,
        orderBy: { id: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      this.prisma.club_event_registrations.count({ where }),
    ]);

    const memberMap = await loadMemberBriefMap(this.prisma, rows.map((r) => r.member_id));

    return paginated(rows.map((r) => this.mapRegistration(r, memberMap)), total, q.page, q.pageSize);
  }

  private async mapRegistrationRow(
    row: Prisma.club_event_registrationsGetPayload<{ include: typeof registrationInclude }>,
  ) {
    const memberMap = await loadMemberBriefMap(this.prisma, [row.member_id]);
    return this.mapRegistration(row, memberMap);
  }

  async findOne(id: number) {
    const row = await this.prisma.club_event_registrations.findFirst({
      where: { id, is_deleted: false },
      include: registrationInclude,
    });
    if (!row) throw new NotFoundException('التسجيل غير موجود');
    return this.mapRegistrationRow(row);
  }

  private async findRawOrThrow(id: number, tx?: Tx) {
    const client = tx ?? this.prisma;
    const row = await client.club_event_registrations.findFirst({ where: { id, is_deleted: false } });
    if (!row) throw new NotFoundException('التسجيل غير موجود');
    return row;
  }

  private async getSettings(tx?: Tx) {
    const client = tx ?? this.prisma;
    const row = await client.club_event_settings.findFirst({ orderBy: { id: 'asc' } });
    return {
      refundWindowDays: row?.refund_window_days ?? 3,
      waitlistHoldHours: row?.waitlist_hold_hours ?? 24,
    };
  }

  /**
   * Transaction-scoped sequential doc number `{prefix}-{year}-{padded5}` (e.g. EVR-2026-00042),
   * using MySQL GET_LOCK/RELEASE_LOCK the same way ClubEventsService.generateEventNumber does —
   * NOT a race-prone count()+1 probe, since concurrent registrations/payments are the norm here.
   */
  private async nextNumber(
    tx: Tx,
    lockName: string,
    table: 'club_event_registrations' | 'club_event_payments',
    column: 'registration_number' | 'payment_number',
    prefix: string,
  ): Promise<string> {
    const year = new Date().getFullYear();
    await tx.$queryRaw`SELECT GET_LOCK(${lockName}, 10)`;
    try {
      const like = `${prefix}-${year}-`;
      const rows = await tx.$queryRawUnsafe<{ maxNum: number | null }[]>(
        `SELECT MAX(CAST(SUBSTRING(\`${column}\`, ${like.length + 1}) AS UNSIGNED)) AS maxNum
         FROM \`${table}\` WHERE \`${column}\` LIKE ?`,
        `${like}%`,
      );
      const next = (rows[0]?.maxNum ?? 0) + 1;
      return `${like}${String(next).padStart(5, '0')}`;
    } finally {
      await tx.$queryRaw`SELECT RELEASE_LOCK(${lockName})`;
    }
  }

  /** Unique check-in code with a small retry loop for the astronomically-unlikely collision. */
  private async uniqueCheckinCode(tx: Tx): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = genCheckinCode();
      const existing = await tx.club_event_registrations.findUnique({ where: { checkin_code: code } });
      if (!existing) return code;
    }
    throw new BadRequestException('تعذّر إنشاء كود دخول فريد — حاول مرة أخرى');
  }

  private computePrice(
    tier: { price: Prisma.Decimal; early_bird_price: Prisma.Decimal | null; early_bird_until: string | null } | null,
  ): number {
    if (!tier) return 0;
    const today = localDateString();
    if (tier.early_bird_price != null && tier.early_bird_until && today <= tier.early_bird_until) {
      return roundMoney(toNum(tier.early_bird_price));
    }
    return roundMoney(toNum(tier.price));
  }

  async register(dto: RegisterClubEventDto, userId?: number, options?: ClubEventRegisterOptions) {
    const liveSelfCheckin = options?.liveSelfCheckin ?? false;
    const registrantType = dto.registrantType ?? (dto.memberId ? 'member' : 'guest');

    if (registrantType === 'member' && !dto.memberId) {
      throw new BadRequestException('كود العضو مطلوب لتسجيل عضو');
    }
    if (registrantType === 'guest' && !dto.guestName?.trim()) {
      throw new BadRequestException('اسم الضيف مطلوب');
    }

    const event = await this.prisma.club_events.findFirst({
      where: { id: dto.eventId, is_deleted: false },
    });
    if (!event) throw new NotFoundException('الفعالية غير موجودة');
    const allowedStatuses: readonly string[] = liveSelfCheckin ? LIVE_SELF_CHECKIN_STATUSES : STANDARD_REGISTER_STATUSES;
    if (!allowedStatuses.includes(event.status)) {
      throw new BadRequestException('التسجيل غير متاح لهذه الفعالية في حالتها الحالية');
    }
    if (registrantType === 'guest' && !event.allow_guests && !liveSelfCheckin) {
      throw new BadRequestException('هذه الفعالية لا تسمح بتسجيل الضيوف');
    }

    let member: Awaited<ReturnType<ClubMembersService['resolveByIdOrCode']>> | null = null;
    if (dto.memberId) {
      member = await this.members.resolveByIdOrCode(dto.memberId, undefined);
    }

    if (event.requires_active_subscription && member) {
      const result = await this.entitlement.validate({
        memberId: member.id,
        branchId: dto.branchId ?? member.branch_id,
        requireActiveSubscription: true,
      });
      if (!result.allowed) {
        throw new BadRequestException({
          message: 'لا يمكن التسجيل — تحقق من حالة الاشتراك',
          entitlement: result,
        });
      }
    }

    let tier: Prisma.club_event_ticket_tiersGetPayload<Record<string, never>> | null = null;
    if (dto.tierId) {
      tier = await this.prisma.club_event_ticket_tiers.findFirst({
        where: { id: dto.tierId, event_id: dto.eventId, is_active: true },
      });
      if (!tier) throw new NotFoundException('فئة التذكرة غير موجودة');
    }

    if (dto.sessionId) {
      const session = await this.prisma.club_event_sessions.findFirst({
        where: { id: dto.sessionId, event_id: dto.eventId },
      });
      if (!session) throw new NotFoundException('الجلسة غير موجودة');
    }

    const branchId = dto.branchId ?? member?.branch_id ?? event.branch_id;
    const price = tier ? this.computePrice(tier) : 0;
    const isFree = event.is_free || price <= 0;

    const registration = await this.prisma.$transaction(async (tx) => {
      // Serialize all capacity/dup checks + writes for this event behind a MySQL named lock —
      // same GET_LOCK/RELEASE_LOCK pattern as nextNumber() above. Plain reads inside a
      // transaction do NOT prevent two concurrent registration transactions from both observing
      // the same under-capacity count under InnoDB's default REPEATABLE READ, so the count-then-
      // insert here must be serialized explicitly to avoid overbooking events/tiers.
      const lockName = `club_event_register_${dto.eventId}`;
      await tx.$queryRaw`SELECT GET_LOCK(${lockName}, 10)`;
      try {
        // Explicit existing-registration check — the DB unique constraint on
        // (event_id, member_id, session_id) is NOT trustworthy when session_id is NULL because MySQL
        // treats NULL as distinct in unique indexes, so two NULL-session rows for the same member
        // would otherwise slip through.
        if (member) {
          const dup = await tx.club_event_registrations.findFirst({
            where: {
              event_id: dto.eventId,
              member_id: member.id,
              session_id: dto.sessionId ?? null,
              is_deleted: false,
              status: { not: 'cancelled' },
            },
          });
          if (dup) {
            throw new BadRequestException('العضو مسجل بالفعل في هذه الفعالية/الجلسة');
          }
        }

        // Capacity check: event-level max_capacity (0 = unlimited) plus tier capacity if set.
        const activeCount = await tx.club_event_registrations.count({
          where: {
            event_id: dto.eventId,
            is_deleted: false,
            status: { in: ['pending_payment', 'confirmed'] },
          },
        });
        let tierFull = false;
        if (tier?.capacity != null) {
          const tierCount = await tx.club_event_registrations.count({
            where: {
              tier_id: tier.id,
              is_deleted: false,
              status: { in: ['pending_payment', 'confirmed'] },
            },
          });
          tierFull = tierCount >= tier.capacity;
        }
        const eventFull = event.max_capacity > 0 && activeCount >= event.max_capacity;
        const isFull = eventFull || tierFull;

        let status: 'pending_payment' | 'confirmed' | 'waitlisted' = isFree ? 'confirmed' : 'pending_payment';
        let waitlistPosition: number | null = null;
        let holdExpiresAt: Date | null = null;

        // Live kiosk/QR walk-ins are confirmed at the door — no online payment step.
        if (liveSelfCheckin && registrantType === 'guest' && status === 'pending_payment') {
          status = 'confirmed';
        }

        if (isFull) {
          const maxWaitlistPos = await tx.club_event_registrations.aggregate({
            where: { event_id: dto.eventId, status: 'waitlisted', is_deleted: false },
            _max: { waitlist_position: true },
          });
          status = 'waitlisted';
          waitlistPosition = (maxWaitlistPos._max.waitlist_position ?? 0) + 1;
        }

        // Guardian-consent gate: block reaching 'confirmed' unless guardian fields + signed consent
        // are present. Only free/unpaid registrations can reach 'confirmed' at creation time (paid
        // ones start 'pending_payment' and only flip to 'confirmed' in pay(), which re-checks this
        // gate) — so falling back to 'pending_payment' here is the only case that applies.
        if (event.requires_guardian_consent && status === 'confirmed') {
          const hasGuardian =
            dto.guardianName?.trim() && dto.guardianPhone?.trim() && dto.consentSigned === true;
          if (!hasGuardian) status = 'pending_payment';
        }

        const registrationNumber = await this.nextNumber(
          tx,
          'club_event_registration_number',
          'club_event_registrations',
          'registration_number',
          'EVR',
        );
        const checkinCode = await this.uniqueCheckinCode(tx);

        const created = await tx.club_event_registrations.create({
          data: {
            registration_number: registrationNumber,
            event_id: dto.eventId,
            session_id: dto.sessionId ?? null,
            tier_id: dto.tierId ?? null,
            registrant_type: registrantType,
            member_id: member?.id ?? null,
            guest_name: registrantType === 'guest' ? dto.guestName ?? null : null,
            guest_phone: dto.guestPhone ?? null,
            guest_email: dto.guestEmail ?? null,
            lead_source: dto.leadSource ?? null,
            branch_id: branchId,
            status,
            waitlist_position: waitlistPosition,
            hold_expires_at: holdExpiresAt,
            price,
            checkin_code: checkinCode,
            participant_dob: dto.participantDob ?? null,
            guardian_name: dto.guardianName ?? null,
            guardian_phone: dto.guardianPhone ?? null,
            guardian_relation: dto.guardianRelation ?? null,
            consent_signed: dto.consentSigned ?? false,
            consent_file: dto.consentFile ?? null,
            emergency_phone: dto.emergencyPhone ?? null,
            channel: dto.channel ?? null,
            notes: dto.notes ?? null,
            created_by: userId ?? null,
          },
          include: registrationInclude,
        });

        await tx.club_events.update({
          where: { id: dto.eventId },
          data: { registrations_count: { increment: 1 } },
        });

        return created;
      } finally {
        await tx.$queryRaw`SELECT RELEASE_LOCK(${lockName})`;
      }
    });

    await this.audit.log({
      entityType: 'club_event_registration',
      entityId: registration.id,
      action: 'register',
      actorUserId: userId,
      branchId: registration.branch_id,
      after: {
        registrationNumber: registration.registration_number,
        eventId: registration.event_id,
        status: registration.status,
        price: toNum(registration.price),
      },
    });

    return this.mapRegistrationRow(registration);
  }

  async pay(id: number, dto: PayClubEventRegistrationDto, userId?: number) {
    const existing = await this.findRawOrThrow(id);

    const existingPayment = await this.prisma.club_event_payments.findFirst({
      where: { registration_id: id, idempotency_key: dto.idempotencyKey },
    });
    if (existingPayment) {
      return this.mapPayment(existingPayment);
    }

    const event = await this.prisma.club_events.findFirst({ where: { id: existing.event_id } });
    if (!event) throw new NotFoundException('الفعالية غير موجودة');

    if (existing.status === 'cancelled' || existing.status === 'refunded') {
      throw new BadRequestException('لا يمكن الدفع لتسجيل ملغى أو مسترد');
    }

    const date = localDateString();

    let result: Prisma.club_event_paymentsGetPayload<Record<string, never>>;
    let wasDuplicate = false;
    try {
      result = await this.prisma.$transaction(async (tx) => {
        // Re-check idempotency inside the transaction: two concurrent retries with the same
        // idempotencyKey can both pass the pre-check above (neither has committed yet), so this
        // second check narrows — but doesn't fully close — the race. The `uq_payment_reg_idem`
        // unique constraint is the real guard; a losing concurrent request falls through to the
        // catch block below and returns the winner's payment instead of a raw 500.
        const dupe = await tx.club_event_payments.findFirst({
          where: { registration_id: id, idempotency_key: dto.idempotencyKey },
        });
        if (dupe) {
          wasDuplicate = true;
          return dupe;
        }

        const paymentNumber = await this.nextNumber(
          tx,
          'club_event_payment_number',
          'club_event_payments',
          'payment_number',
          'EVP',
        );

        const payment = await tx.club_event_payments.create({
          data: {
            payment_number: paymentNumber,
            registration_id: id,
            event_id: existing.event_id,
            branch_id: existing.branch_id,
            type: 'payment',
            amount: dto.amount,
            payment_method: (dto.paymentMethod as never) ?? null,
            payment_date: date,
            status: 'completed',
            idempotency_key: dto.idempotencyKey,
            description: dto.description ?? null,
            created_by: userId ?? null,
          },
        });

        await this.moduleLedger.postEventPayment(
          {
            paymentNumber,
            eventNumber: event.event_number,
            branchId: existing.branch_id,
            date,
            amount: dto.amount,
            paymentMethod: dto.paymentMethod,
            createdBy: userId,
          },
          tx,
        );

        const newPaid = roundMoney(toNum(existing.paid_amount) + dto.amount);
        let newStatus = existing.status;
        if (newPaid >= toNum(existing.price) && existing.status === 'pending_payment') {
          // Guardian-consent gate still applies before flipping to confirmed.
          const consentOk =
            !event.requires_guardian_consent ||
            (existing.guardian_name?.trim() && existing.guardian_phone?.trim() && existing.consent_signed);
          if (consentOk) newStatus = 'confirmed';
        }

        await tx.club_event_registrations.update({
          where: { id },
          data: {
            paid_amount: newPaid,
            status: newStatus,
            hold_expires_at: null,
          },
        });

        return payment;
      });
    } catch (e) {
      // Losing side of a concurrent idempotent retry: the unique constraint on
      // (registration_id, idempotency_key) rejected our insert because the other request's
      // transaction committed first — fetch and return its payment instead of surfacing a 500.
      if (
        dto.idempotencyKey &&
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002' &&
        isUniqueTarget(e, 'idem')
      ) {
        const winner = await this.prisma.club_event_payments.findFirst({
          where: { registration_id: id, idempotency_key: dto.idempotencyKey },
        });
        if (winner) return this.mapPayment(winner);
      }
      throw e;
    }

    if (wasDuplicate) {
      return this.mapPayment(result);
    }

    await this.audit.log({
      entityType: 'club_event_registration',
      entityId: id,
      action: 'payment',
      actorUserId: userId,
      branchId: existing.branch_id,
      after: { paymentNumber: result.payment_number, amount: dto.amount },
    });

    return this.mapPayment(result);
  }

  async refund(id: number, dto: RefundClubEventRegistrationDto, cancel: boolean, userId?: number) {
    const existing = await this.findRawOrThrow(id);
    const event = await this.prisma.club_events.findFirst({ where: { id: existing.event_id } });
    if (!event) throw new NotFoundException('الفعالية غير موجودة');

    const priorRefundsAgg = await this.prisma.club_event_payments.aggregate({
      where: { registration_id: id, type: 'refund', status: 'completed' },
      _sum: { amount: true },
    });
    const alreadyRefunded = toNum(priorRefundsAgg._sum.amount);
    const refundableCap = roundMoney(Math.max(0, toNum(existing.paid_amount) - alreadyRefunded));
    if (dto.amount > refundableCap + 0.001) {
      throw new BadRequestException(`الحد الأقصى القابل للاسترداد هو ${refundableCap}`);
    }

    const date = localDateString();

    const result = await this.prisma.$transaction(async (tx) => {
      const paymentNumber = await this.nextNumber(
        tx,
        'club_event_payment_number',
        'club_event_payments',
        'payment_number',
        'EVP',
      );

      const refundPayment = await tx.club_event_payments.create({
        data: {
          payment_number: paymentNumber,
          registration_id: id,
          event_id: existing.event_id,
          branch_id: existing.branch_id,
          type: 'refund',
          amount: dto.amount,
          payment_method: (dto.paymentMethod as never) ?? null,
          payment_date: date,
          status: 'completed',
          description: dto.reason ?? null,
          created_by: userId ?? null,
        },
      });

      await this.moduleLedger.postEventRefund(
        {
          paymentNumber,
          eventNumber: event.event_number,
          branchId: existing.branch_id,
          date,
          amount: dto.amount,
          paymentMethod: dto.paymentMethod,
          createdBy: userId,
        },
        tx,
      );

      const newPaid = roundMoney(Math.max(0, toNum(existing.paid_amount) - dto.amount));
      const fullRefund = newPaid <= 0.001;
      const newStatus = cancel && fullRefund ? 'refunded' : existing.status;

      const updated = await tx.club_event_registrations.update({
        where: { id },
        data: {
          paid_amount: newPaid,
          status: newStatus,
        },
      });

      let promoted: number | null = null;
      if (newStatus === 'refunded' || newStatus === 'cancelled') {
        promoted = await this.promoteFirstWaitlisted(tx, existing.event_id, userId);
      }

      return { refundPayment, updated, promoted };
    });

    await this.audit.log({
      entityType: 'club_event_registration',
      entityId: id,
      action: 'refund',
      actorUserId: userId,
      branchId: existing.branch_id,
      after: {
        paymentNumber: result.refundPayment.payment_number,
        amount: dto.amount,
        newStatus: result.updated.status,
        promotedRegistrationId: result.promoted,
      },
      reason: dto.reason,
    });

    return this.mapPayment(result.refundPayment);
  }

  async cancel(id: number, reason: string | undefined, userId?: number) {
    const existing = await this.findRawOrThrow(id);
    if (existing.status === 'cancelled' || existing.status === 'refunded') {
      throw new BadRequestException('التسجيل ملغى بالفعل');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const wasCounted = existing.status !== 'waitlisted';

      const updated = await tx.club_event_registrations.update({
        where: { id },
        data: {
          status: 'cancelled',
          cancelled_at: new Date(),
          cancel_reason: reason ?? null,
        },
      });

      if (wasCounted) {
        await tx.club_events.update({
          where: { id: existing.event_id },
          data: { registrations_count: { decrement: 1 } },
        });
      }

      const promoted = wasCounted
        ? await this.promoteFirstWaitlisted(tx, existing.event_id, userId)
        : null;

      return { updated, promoted };
    });

    await this.audit.log({
      entityType: 'club_event_registration',
      entityId: id,
      action: 'cancel',
      actorUserId: userId,
      branchId: existing.branch_id,
      reason,
      after: { status: 'cancelled', promotedRegistrationId: result.promoted },
    });

    return this.findOne(id);
  }

  /**
   * Promote the first waitlisted registration for an event to pending_payment with a fresh hold
   * window, freeing a capacity slot. Shared by refund's cancel=true path and manual cancel — both
   * need identical "who's next" logic. No-op (returns null) if nobody is waiting.
   */
  private async promoteFirstWaitlisted(tx: Tx, eventId: number, userId?: number): Promise<number | null> {
    const next = await tx.club_event_registrations.findFirst({
      where: { event_id: eventId, status: 'waitlisted', is_deleted: false },
      orderBy: [{ waitlist_position: 'asc' }, { id: 'asc' }],
    });
    if (!next) return null;

    const settings = await this.getSettings(tx);
    const holdExpiresAt = new Date(Date.now() + settings.waitlistHoldHours * 3600_000);

    await tx.club_event_registrations.update({
      where: { id: next.id },
      data: {
        status: 'pending_payment',
        waitlist_position: null,
        hold_expires_at: holdExpiresAt,
      },
    });

    await this.audit.log({
      entityType: 'club_event_registration',
      entityId: next.id,
      action: 'promote_from_waitlist',
      actorUserId: userId,
      branchId: next.branch_id,
      after: { holdExpiresAt },
    });

    return next.id;
  }

  /** Manual promotion of a specific waitlisted registration (same hold logic as the shared helper). */
  async promote(id: number, userId?: number) {
    const existing = await this.findRawOrThrow(id);
    if (existing.status !== 'waitlisted') {
      throw new BadRequestException('التسجيل ليس في قائمة الانتظار');
    }

    const settings = await this.getSettings();
    const holdExpiresAt = new Date(Date.now() + settings.waitlistHoldHours * 3600_000);

    await this.prisma.club_event_registrations.update({
      where: { id },
      data: {
        status: 'pending_payment',
        waitlist_position: null,
        hold_expires_at: holdExpiresAt,
      },
    });

    await this.audit.log({
      entityType: 'club_event_registration',
      entityId: id,
      action: 'promote_from_waitlist',
      actorUserId: userId,
      branchId: existing.branch_id,
      after: { holdExpiresAt },
    });

    return this.findOne(id);
  }

  async update(id: number, dto: PatchClubEventRegistrationDto, userId?: number) {
    const existing = await this.findRawOrThrow(id);
    if (existing.status === 'cancelled' || existing.status === 'refunded') {
      throw new BadRequestException('لا يمكن تعديل تسجيل ملغى أو مسترد');
    }

    if (dto.tierId != null) {
      const tier = await this.prisma.club_event_ticket_tiers.findFirst({
        where: { id: dto.tierId, event_id: existing.event_id, is_active: true },
      });
      if (!tier) throw new NotFoundException('فئة التذكرة غير موجودة');
    }
    if (dto.sessionId != null) {
      const session = await this.prisma.club_event_sessions.findFirst({
        where: { id: dto.sessionId, event_id: existing.event_id },
      });
      if (!session) throw new NotFoundException('الجلسة غير موجودة');
    }

    const row = await this.prisma.club_event_registrations.update({
      where: { id },
      data: {
        ...(dto.tierId !== undefined ? { tier_id: dto.tierId } : {}),
        ...(dto.sessionId !== undefined ? { session_id: dto.sessionId } : {}),
        ...(dto.guestName !== undefined ? { guest_name: dto.guestName } : {}),
        ...(dto.guestPhone !== undefined ? { guest_phone: dto.guestPhone } : {}),
        ...(dto.guestEmail !== undefined ? { guest_email: dto.guestEmail } : {}),
        ...(dto.participantDob !== undefined ? { participant_dob: dto.participantDob } : {}),
        ...(dto.guardianName !== undefined ? { guardian_name: dto.guardianName } : {}),
        ...(dto.guardianPhone !== undefined ? { guardian_phone: dto.guardianPhone } : {}),
        ...(dto.guardianRelation !== undefined ? { guardian_relation: dto.guardianRelation } : {}),
        ...(dto.consentSigned !== undefined ? { consent_signed: dto.consentSigned } : {}),
        ...(dto.consentFile !== undefined ? { consent_file: dto.consentFile } : {}),
        ...(dto.emergencyPhone !== undefined ? { emergency_phone: dto.emergencyPhone } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
      include: registrationInclude,
    });

    await this.audit.log({
      entityType: 'club_event_registration',
      entityId: id,
      action: 'update',
      actorUserId: userId,
      branchId: existing.branch_id,
      before: { tierId: existing.tier_id, sessionId: existing.session_id },
      after: { tierId: row.tier_id, sessionId: row.session_id },
    });

    return this.mapRegistrationRow(row);
  }
}
