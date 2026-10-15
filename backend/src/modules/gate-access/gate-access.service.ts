import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { ClubAttendanceService } from '../club-members/club-attendance.service';
import { EntitlementService } from '../gym-ops/entitlement.service';
import {
  CreateGateControllerDto,
  GateCommandResultDto,
  GateEventDto,
  GateEventsQueryDto,
  GateHeartbeatDto,
  OpenGateDoorDto,
  UpdateGateControllerDto,
} from './dto/gate-access.dto';
import { GateCredentialService } from './gate-credential.service';

const NORMAL_ACCESS_EVENT_TYPES = new Set([0, 1]);
const LIVE_LOOKUP_EVENT_TYPE = 27;

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function newAgentToken(): string {
  return `one80g_${randomBytes(32).toString('base64url')}`;
}

function jsonObject(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 500);
  return String(error).slice(0, 500);
}

function normalizeTime(value: string | null | undefined, fallback: string): string {
  const match = /^(\d{2}):(\d{2})/.exec(value ?? '');
  return match ? `${match[1]}:${match[2]}` : fallback;
}

@Injectable()
export class GateAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: GateCredentialService,
    private readonly entitlement: EntitlementService,
    private readonly attendance: ClubAttendanceService,
    private readonly branchScope: BranchScopeService,
  ) {}

  private async controllerOrThrow(id: number, user?: JwtUser) {
    const row = await this.prisma.gate_controllers.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('وحدة تحكم البوابة غير موجودة');
    if (user && !this.branchScope.isBranchAllowed(user, row.branch_id)) {
      throw new ForbiddenException('لا تملك صلاحية الوصول لبوابة هذا الفرع');
    }
    return row;
  }

  private mapController(
    row: Awaited<ReturnType<GateAccessService['controllerOrThrow']>>,
    branchName?: string | null,
  ) {
    const isRecentlySeen =
      row.last_seen_at != null && Date.now() - row.last_seen_at.getTime() <= 45_000;
    return {
      id: row.id,
      name: row.name,
      branchId: row.branch_id,
      branchName: branchName ?? null,
      model: row.model,
      staticIp: row.static_ip,
      port: row.port,
      entryDoorNo: row.entry_door_no,
      exitDoorNo: row.exit_door_no,
      tokenPrefix: row.agent_token_prefix,
      status: !row.is_active ? 'disabled' : isRecentlySeen ? row.status : 'offline',
      isActive: row.is_active,
      lastSeenAt: row.last_seen_at,
      lastSyncAt: row.last_sync_at,
      firmwareVersion: row.firmware_version,
      serialNumber: row.serial_number,
      connectionMode: row.connection_mode ?? 'agent',
      timezone: row.timezone ?? 'Africa/Cairo',
      pushAllowedIp: row.push_allowed_ip ?? null,
      agentVersion: row.agent_version,
      lastError: row.last_error,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async listControllers(user?: JwtUser) {
    const allowedBranches = this.branchScope.allowedBranchIds(user);
    const rows = await this.prisma.gate_controllers.findMany({
      where: allowedBranches ? { branch_id: { in: allowedBranches } } : undefined,
      orderBy: [{ branch_id: 'asc' }, { id: 'asc' }],
    });
    const branchIds = [...new Set(rows.map((row) => row.branch_id))];
    const branches = branchIds.length
      ? await this.prisma.tbl_branches.findMany({
          where: { branch_id: { in: branchIds } },
          select: { branch_id: true, branch_name: true },
        })
      : [];
    const names = new Map(branches.map((branch) => [branch.branch_id, branch.branch_name]));
    return rows.map((row) => this.mapController(row, names.get(row.branch_id)));
  }

  private validateHardware(model: string, entry: number, exit: number) {
    if (!['C3-200', 'INBIO160-PRO', 'INBIO260-PRO'].includes(model)) {
      throw new BadRequestException('هذا الموديل غير مدعوم بمسار Pull SDK للبوابات');
    }
    const doors = model === 'INBIO160-PRO' ? 1 : 2;
    if (!Number.isInteger(entry) || entry < 1 || entry > doors ||
        !Number.isInteger(exit) || exit < 0 || exit > doors) {
      throw new BadRequestException('أرقام مخارج البوابة لا تطابق سعة الكنترول');
    }
  }

  async createController(dto: CreateGateControllerDto, user?: JwtUser) {
    if (user && !this.branchScope.isBranchAllowed(user, dto.branchId)) {
      throw new ForbiddenException('لا تملك صلاحية إعداد بوابة لهذا الفرع');
    }
    const connectionMode = dto.connectionMode ?? 'agent';
    const serialNumber = dto.serialNumber?.trim().toUpperCase() || null;
    if (connectionMode === 'push' && !serialNumber) {
      throw new BadRequestException('الاتصال المباشر يحتاج الرقم التسلسلي (Serial Number) للكنترول');
    }
    if (connectionMode === 'agent' && !dto.staticIp) {
      throw new BadRequestException('برنامج الويندوز يحتاج IP الكنترول');
    }
    const model = dto.model?.trim() || (connectionMode === 'push' ? 'INBIO260-PRO' : 'C3-200');
    const entry = dto.entryDoorNo ?? 1;
    const exit = dto.exitDoorNo ?? (model === 'INBIO160-PRO' ? 0 : 2);
    if (connectionMode !== 'push') this.validateHardware(model, entry, exit);
    const branch = await this.prisma.tbl_branches.findUnique({
      where: { branch_id: dto.branchId },
      select: { branch_id: true, branch_name: true },
    });
    if (!branch) throw new BadRequestException('الفرع غير موجود');

    const token = newAgentToken();
    const row = await this.withSerialConflict(() => this.prisma.gate_controllers.create({
      data: {
        name: dto.name.trim(),
        branch_id: dto.branchId,
        model,
        static_ip: dto.staticIp ?? '',
        port: dto.port ?? 4370,
        entry_door_no: entry,
        exit_door_no: exit,
        connection_mode: connectionMode,
        serial_number: serialNumber,
        push_allowed_ip: dto.pushAllowedIp || null,
        ...(dto.timezone ? { timezone: dto.timezone } : {}),
        agent_token_hash: tokenHash(token),
        agent_token_prefix: token.slice(0, 12),
      },
    }));

    return {
      controller: this.mapController(row, branch.branch_name),
      agentToken: token,
      warning: 'احفظي Agent Token الآن؛ لن يظهر مرة أخرى.',
    };
  }

  async updateController(id: number, dto: UpdateGateControllerDto, user?: JwtUser) {
    const current = await this.controllerOrThrow(id, user);
    const effectiveMode = dto.connectionMode ?? current.connection_mode ?? 'agent';
    const effectiveSerial = dto.serialNumber !== undefined ? dto.serialNumber?.trim() : current.serial_number;
    if (effectiveMode === 'push' && !effectiveSerial) {
      throw new BadRequestException('الاتصال المباشر يحتاج الرقم التسلسلي (Serial Number) للكنترول');
    }
    if (effectiveMode !== 'push') {
      this.validateHardware(dto.model ?? current.model, dto.entryDoorNo ?? current.entry_door_no, dto.exitDoorNo ?? current.exit_door_no);
    }
    if (dto.branchId != null) {
      if (user && !this.branchScope.isBranchAllowed(user, dto.branchId)) {
        throw new ForbiddenException('لا تملك صلاحية إعداد بوابة لهذا الفرع');
      }
      const branch = await this.prisma.tbl_branches.findUnique({
        where: { branch_id: dto.branchId },
        select: { branch_id: true },
      });
      if (!branch) throw new BadRequestException('الفرع غير موجود');
    }

    const row = await this.withSerialConflict(() => this.prisma.gate_controllers.update({
      where: { id },
      data: {
        ...(dto.connectionMode != null ? { connection_mode: dto.connectionMode } : {}),
        ...(dto.serialNumber !== undefined
          ? { serial_number: dto.serialNumber?.trim().toUpperCase() || null }
          : {}),
        ...(dto.pushAllowedIp !== undefined ? { push_allowed_ip: dto.pushAllowedIp || null } : {}),
        ...(dto.timezone != null ? { timezone: dto.timezone } : {}),
        ...(dto.model != null ? { model: dto.model } : {}),
        ...(dto.name != null ? { name: dto.name.trim() } : {}),
        ...(dto.branchId != null ? { branch_id: dto.branchId } : {}),
        ...(dto.staticIp != null ? { static_ip: dto.staticIp } : {}),
        ...(dto.port != null ? { port: dto.port } : {}),
        ...(dto.entryDoorNo != null ? { entry_door_no: dto.entryDoorNo } : {}),
        ...(dto.exitDoorNo != null ? { exit_door_no: dto.exitDoorNo } : {}),
        ...(dto.isActive != null ? { is_active: dto.isActive } : {}),
      },
    }));
    return this.mapController(row);
  }

  async rotateToken(id: number, user?: JwtUser) {
    await this.controllerOrThrow(id, user);
    const token = newAgentToken();
    await this.prisma.gate_controllers.update({
      where: { id },
      data: {
        agent_token_hash: tokenHash(token),
        agent_token_prefix: token.slice(0, 12),
      },
    });
    return {
      controllerId: id,
      agentToken: token,
      warning: 'استبدلي الـToken في config.json على كمبيوتر الجيم فورًا.',
    };
  }

  private async withSerialConflict<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException('الرقم التسلسلي مستخدم لبوابة أخرى');
      }
      throw error;
    }
  }

  /**
   * Shared by staff actions and by the push transport, which answers a live scan by
   * queueing the opening for the controller's next poll. Expiry is enforced in takeCommands.
   */
  async enqueueCommand(
    controllerId: number,
    type: 'open_door' | 'sync_time',
    payload: Record<string, unknown>,
    createdBy?: number | null,
  ) {
    const row = await this.prisma.gate_commands.create({
      data: {
        controller_id: controllerId,
        type,
        payload: jsonObject(payload),
        created_by: createdBy ?? null,
      },
    });
    return { commandId: row.id.toString(), status: row.status };
  }

  async queueOpenDoor(id: number, dto: OpenGateDoorDto, user?: JwtUser) {
    const controller = await this.controllerOrThrow(id, user);
    if (!controller.is_active) throw new BadRequestException('وحدة التحكم معطلة');
    if (controller.status !== 'online' || !controller.last_seen_at || Date.now() - controller.last_seen_at.getTime() > 45_000) {
      throw new BadRequestException('البوابة غير متصلة؛ لن يتم حفظ أمر فتح مؤجل');
    }
    if (dto.doorNo < 1 || ![controller.entry_door_no, controller.exit_door_no].includes(dto.doorNo)) {
      throw new BadRequestException('رقم الباب غير مضبوط على هذه الوحدة');
    }
    return this.enqueueCommand(id, 'open_door', {
      doorNo: dto.doorNo,
      seconds: dto.seconds ?? 1,
      controllerIp: controller.static_ip,
      controllerPort: controller.port,
      controllerModel: controller.model,
    }, user?.sub);
  }

  async listEvents(query: GateEventsQueryDto, user?: JwtUser) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, query.pageSize ?? 25));
    const scopedBranches = this.branchScope.resolveListFilter(user, query.branchId);
    const where: Prisma.gate_eventsWhereInput = {
      ...(query.controllerId ? { controller_id: query.controllerId } : {}),
      ...(query.accepted ? { accepted: query.accepted === 'true' } : {}),
      ...(scopedBranches
        ? { controller: { is: { branch_id: { in: scopedBranches } } } }
        : {}),
      ...(query.search?.trim()
        ? {
            OR: [
              { credential_no: { contains: query.search.trim() } },
              { member: { is: { name: { contains: query.search.trim() } } } },
              { member: { is: { member_code: { contains: query.search.trim() } } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.gate_events.findMany({
        where,
        include: {
          controller: { select: { name: true } },
          member: { select: { name: true, member_code: true } },
        },
        orderBy: [{ event_time: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.gate_events.count({ where }),
    ]);
    return {
      data: rows.map((row) => ({
        id: row.id.toString(),
        controllerId: row.controller_id,
        controllerName: row.controller.name,
        credentialNo: row.credential_no,
        memberId: row.member_id,
        memberName: row.member?.name ?? null,
        memberCode: row.member?.member_code ?? null,
        doorNo: row.door_no,
        direction: row.direction,
        eventType: row.event_type,
        eventTime: row.event_time,
        accepted: row.accepted,
        reasonCode: row.reason_code,
        reasonMessage: row.reason_message,
        attendanceId: row.attendance_id,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async heartbeat(controllerId: number, dto: GateHeartbeatDto) {
    const row = await this.prisma.gate_controllers.update({
      where: { id: controllerId },
      data: {
        status: dto.status ?? 'online',
        last_seen_at: new Date(),
        ...(dto.synced ? { last_sync_at: new Date() } : {}),
        ...(dto.agentVersion != null ? { agent_version: dto.agentVersion } : {}),
        ...(dto.firmwareVersion != null
          ? { firmware_version: dto.firmwareVersion }
          : {}),
        ...(dto.serialNumber != null ? { serial_number: dto.serialNumber } : {}),
        last_error: dto.lastError?.trim() || null,
      },
    });
    return {
      ok: true,
      serverTime: new Date().toISOString(),
      controller: {
        id: row.id,
        staticIp: row.static_ip,
        port: row.port,
        entryDoorNo: row.entry_door_no,
        exitDoorNo: row.exit_door_no,
      },
    };
  }

  /**
   * Builds the offline C3 authorization set. We deliberately run the same
   * EntitlementService used by reception, then encode its date/time window into
   * C3 users + timezones. That keeps offline decisions aligned with the web app.
   */
  async snapshot(controllerId: number) {
    const controller = await this.controllerOrThrow(controllerId);
    const members = await this.prisma.club_members.findMany({
      where: {
        branch_id: controller.branch_id,
        is_active: true,
        is_deleted: false,
        subscriptions: { some: {} },
      },
      select: { id: true, member_code: true, name: true },
      orderBy: { id: 'asc' },
    });

    const eligible: Array<{
      memberId: number;
      memberCode: string;
      name: string;
      credentialNo: string;
      startDate: string;
      endDate: string;
      timeFrom: string;
      timeTo: string;
    }> = [];

    // Chunking avoids exhausting the DB connection pool at larger clubs.
    for (let offset = 0; offset < members.length; offset += 20) {
      const chunk = members.slice(offset, offset + 20);
      const results = await Promise.all(
        chunk.map(async (member) => {
          const result = await this.entitlement.validate({
            memberId: member.id,
            branchId: controller.branch_id,
          });
          if (!result.allowed || !result.activeSubscription) return null;
          // Special-class access also depends on a live class schedule, which a
          // standalone C3 timezone cannot represent safely.
          if (result.activeSubscription.specialClassTypeId != null) return null;
          const credential = await this.credentials.ensureForMember(member.id);
          // C3 reports numeric card values: leading zeroes cannot round-trip.
          // Never reactivate disabled credentials or truncate values for Wiegand-26.
          if (!credential.is_active || !/^[1-9]\d{0,7}$/.test(credential.credential_no)
            || Number(credential.credential_no) > 16_777_215) return null;
          return {
            memberId: member.id,
            memberCode: member.member_code,
            name: member.name,
            credentialNo: credential.credential_no,
            startDate: result.activeSubscription.startDate.replaceAll('-', ''),
            endDate: (result.accessValidUntil ?? result.activeSubscription.endDate).replaceAll('-', ''),
            timeFrom: result.activeSubscription.isTimeBased
              ? normalizeTime(result.activeSubscription.timeFrom, '00:00')
              : '00:00',
            timeTo: result.activeSubscription.isTimeBased
              ? normalizeTime(result.activeSubscription.timeTo, '23:59')
              : '23:59',
          };
        }),
      );
      eligible.push(...results.filter((row): row is NonNullable<typeof row> => row != null));
    }

    const windows = [...new Set(eligible.map((row) => `${row.timeFrom}-${row.timeTo}`))].sort();
    if (windows.length > 50) {
      throw new BadRequestException(
        'عدد فترات الدخول المختلفة أكبر من سعة C3-200 (50 فترة)',
      );
    }
    const timezoneIds = new Map(windows.map((window, index) => [window, index + 1]));
    const timezones = windows.map((window) => {
      const [timeFrom, timeTo] = window.split('-');
      return { id: timezoneIds.get(window)!, timeFrom, timeTo };
    });
    const users = eligible.map((row) => ({
      pin: String(row.memberId),
      cardNo: row.credentialNo,
      memberCode: row.memberCode,
      memberName: row.name,
      startDate: row.startDate,
      endDate: row.endDate,
      timezoneId: timezoneIds.get(`${row.timeFrom}-${row.timeTo}`)!,
      doorMask: (1 << (controller.entry_door_no - 1)) | (controller.exit_door_no > 0 ? (1 << (controller.exit_door_no - 1)) : 0),
    }));
    const revision = createHash('sha256')
      .update(JSON.stringify(users))
      .digest('hex');

    return {
      revision,
      generatedAt: new Date().toISOString(),
      controller: {
        id: controller.id,
        model: controller.model,
        staticIp: controller.static_ip,
        port: controller.port,
        entryDoorNo: controller.entry_door_no,
        exitDoorNo: controller.exit_door_no,
        relaySeconds: 1,
      },
      timezones,
      users,
    };
  }

  async ingestEvent(controllerId: number, dto: GateEventDto) {
    const existing = await this.prisma.gate_events.findUnique({
      where: { event_fingerprint: dto.fingerprint },
    });
    if (existing) {
      return {
        duplicate: true,
        accepted: existing.accepted,
        reasonCode: existing.reason_code,
        openDoor: false,
      };
    }

    const controller = await this.controllerOrThrow(controllerId);
    const occurredAt = new Date(dto.occurredAt);
    if (Number.isNaN(occurredAt.getTime())) {
      throw new BadRequestException('Invalid event timestamp');
    }
    const eventAgeMs = Date.now() - occurredAt.getTime();
    const isFreshLookup = eventAgeMs >= -5_000 && eventAgeMs <= 15_000;
    const direction =
      dto.doorNo === controller.entry_door_no
        ? (controller.entry_door_no === controller.exit_door_no
          ? (dto.inOutState === 1 ? 'exit' : dto.inOutState === 0 ? 'entry' : 'unknown')
          : 'entry')
        : dto.doorNo === controller.exit_door_no
          ? 'exit'
          : 'unknown';

    const credential = dto.credentialNo
      ? await this.credentials.findActive(dto.credentialNo)
      : null;
    let accepted = dto.eventType === 8;
    let reasonCode: string | null = accepted ? 'remote_open' : null;
    let reasonMessage: string | null = null;
    let attendanceId: number | null = null;
    let shouldOpenDoor = false;

    if (credential) {
      const isActionable =
        NORMAL_ACCESS_EVENT_TYPES.has(dto.eventType) ||
        (dto.eventType === LIVE_LOOKUP_EVENT_TYPE && isFreshLookup);
      if (!isActionable) {
        accepted = false;
        reasonCode = dto.eventType === LIVE_LOOKUP_EVENT_TYPE ? 'expired_lookup' : `controller_denied_${dto.eventType}`;
        reasonMessage = 'الكنترول رفض عملية الدخول';
      } else if (direction === 'exit') {
        // Exiting must never be blocked by an expired subscription.
        accepted = true;
        reasonCode = 'exit_allowed';
        try {
          const attendance = await this.attendance.checkOut({
            memberId: credential.member.id,
          }, undefined, occurredAt);
          attendanceId = attendance.id;
        } catch (error) {
          // No open visit is an attendance note, not a reason to trap somebody.
          reasonCode = 'exit_allowed_no_open_visit';
          reasonMessage = errorMessage(error);
        }
        shouldOpenDoor = dto.eventType === LIVE_LOOKUP_EVENT_TYPE;
      } else if (direction === 'entry') {
        const decision = await this.decideEntry(credential.member.id, controller, occurredAt, dto.eventType);
        accepted = decision.accepted;
        reasonCode = decision.reasonCode;
        reasonMessage = decision.reasonMessage;
        attendanceId = decision.attendanceId;
        shouldOpenDoor = decision.accepted && dto.eventType === LIVE_LOOKUP_EVENT_TYPE;
      }
    } else if (dto.eventType !== 8) {
      accepted = false;
      reasonCode = accepted
        ? 'controller_granted_unknown_credential'
        : 'unknown_credential';
      reasonMessage = accepted
        ? 'الكنترول فتح لرمز غير موجود في ONE80 — يجب تنفيذ مزامنة وفحص الكنترول'
        : 'رمز QR غير مسجل أو معطل';
    }

    if (direction === 'entry' && !accepted && dto.credentialNo) {
      const identity = credential ?? await this.credentials.findForEntryAlert(dto.credentialNo);
      if (identity) {
        const denial = await this.entitlement.validate({ memberId: identity.member.id,
          branchId: controller.branch_id, at: occurredAt });
        reasonMessage = denial.reasons.map((reason) => reason.messageAr).join('، ') || reasonMessage || 'الدخول غير مسموح';
        await this.attendance.reportEntryAlert({ memberId: identity.member.id, branchId: controller.branch_id,
          message: reasonMessage, severity: 'block', source: 'gate' });
      }
    }

    // A normal event means the controller already opened locally. A type-27
    // event is an online fallback, so only then do we ask the agent to pulse.
    if (NORMAL_ACCESS_EVENT_TYPES.has(dto.eventType) && accepted) {
      shouldOpenDoor = false;
    }

    const row = await this.prisma.gate_events.create({
      data: {
        controller_id: controllerId,
        event_fingerprint: dto.fingerprint,
        credential_no: dto.credentialNo ?? null,
        member_id: credential?.member.id ?? null,
        door_no: dto.doorNo ?? null,
        direction,
        event_type: dto.eventType,
        event_time: occurredAt,
        accepted,
        reason_code: reasonCode,
        reason_message: reasonMessage,
        attendance_id: attendanceId,
        raw_data: jsonObject(dto),
      },
    });

    // Replayed events may update attendance, but must never open a door later.
    shouldOpenDoor = shouldOpenDoor && controller.is_active && eventAgeMs >= -5_000 && eventAgeMs <= 15_000;
    return {
      eventId: row.id.toString(),
      accepted,
      reasonCode,
      reasonMessage,
      openDoor: shouldOpenDoor,
      doorNo: shouldOpenDoor ? dto.doorNo : undefined,
      seconds: shouldOpenDoor ? 1 : undefined,
    };
  }

  /**
   * The entry decision at an unattended gate:
   *  - a repeat scan inside the check-in cooldown reopens without a second visit or session
   *    (the member scanned but did not pass, or the turnstile timed out);
   *  - exactly one usable subscription → checked in on it at once;
   *  - several → the door still opens and the visit is recorded, flagged for reception to
   *    pick the subscription. Reception is inside, the gate is outside; nobody waits.
   *  - none → denied with the entitlement's own reason.
   */
  private async decideEntry(
    memberId: number,
    controller: { branch_id: number; model: string; name: string },
    occurredAt: Date,
    eventType: number,
  ): Promise<{ accepted: boolean; reasonCode: string; reasonMessage: string | null; attendanceId: number | null }> {
    const controllerOpened = NORMAL_ACCESS_EVENT_TYPES.has(eventType);
    const notes = `${controller.model} gate ${controller.name}`;

    const options = await this.entitlement.usableSubscriptions({
      memberId,
      branchId: controller.branch_id,
      at: occurredAt,
    });
    const usable: typeof options = [];
    for (const option of options) {
      const sub = option.activeSubscription;
      if (!option.allowed || !sub) continue;
      // A class package counts only when one of its classes is about to start.
      if (sub.specialClassTypeId != null
        && !(await this.attendance.hasClassForSubscriptionAt(sub.specialClassTypeId, controller.branch_id, occurredAt))) continue;
      usable.push(option);
    }

    if (usable.length === 0) {
      const denial = options.find((option) => !option.allowed)
        ?? await this.entitlement.validate({ memberId, branchId: controller.branch_id, at: occurredAt });
      const message = denial.reasons.map((reason) => reason.messageAr).join('، ')
        || (options.length ? 'لا توجد حصة مجدولة الآن لاشتراك العضو' : 'الدخول غير مسموح');
      return {
        accepted: false,
        reasonCode: controllerOpened ? 'controller_granted_entitlement_denied' : (denial.reasons[0]?.code ?? 'no_usable_subscription'),
        reasonMessage: message,
        attendanceId: null,
      };
    }

    const recent = await this.attendance.recentCheckIn(memberId, occurredAt);
    const warnings = [...new Set(usable.flatMap((option) => (option.warnings ?? []).map((warning) => warning.messageAr)))];
    if (warnings.length && (usable.length > 1 || recent)) {
      await this.attendance.reportEntryAlert({ memberId, branchId: controller.branch_id,
        message: warnings.join('، '), severity: 'warn', source: 'gate' });
    }
    if (recent) {
      return { accepted: true, reasonCode: 'recent_check_in_reopened', reasonMessage: 'مسح متكرر خلال دقيقتين — فتح بدون تسجيل زيارة جديدة', attendanceId: recent.id };
    }

    try {
      if (usable.length === 1) {
        const checkIn = await this.attendance.checkIn(
          {
            memberId,
            branchId: controller.branch_id,
            subscriptionId: usable[0].activeSubscription!.id,
            consumeSession: true,
            notes,
          },
          undefined,
          occurredAt,
        );
        return { accepted: true, reasonCode: 'access_granted', reasonMessage: null, attendanceId: checkIn.attendance.id };
      }
      const pending = await this.attendance.recordPendingGateEntry({
        memberId,
        branchId: controller.branch_id,
        occurredAt,
        notes,
      });
      return {
        accepted: true,
        reasonCode: 'access_granted_pending_subscription',
        reasonMessage: `للعضو ${usable.length} اشتراكات — بانتظار اختيار الريسبشن`,
        attendanceId: pending.attendance.id,
      };
    } catch (error) {
      return {
        accepted: false,
        reasonCode: controllerOpened ? 'controller_granted_attendance_rejected' : 'attendance_rejected',
        reasonMessage: errorMessage(error),
        attendanceId: null,
      };
    }
  }

  async takeCommands(controllerId: number) {
    const cutoff = new Date(Date.now() - 15_000);
    await this.prisma.gate_commands.updateMany({
      where: { controller_id: controllerId, status: 'pending', created_at: { lt: cutoff } },
      data: { status: 'failed', result: { reason: 'expired_before_delivery' } },
    });
    const rows = await this.prisma.gate_commands.findMany({
      where: { controller_id: controllerId, status: 'pending', created_at: { gte: cutoff } },
      orderBy: { created_at: 'asc' },
      take: 20,
    });
    if (rows.length) {
      await this.prisma.gate_commands.updateMany({
        where: { id: { in: rows.map((row) => row.id) }, status: 'pending' },
        data: {
          status: 'delivered',
          delivered_at: new Date(),
          attempts: { increment: 1 },
        },
      });
    }
    return rows.map((row) => ({
      id: row.id.toString(),
      type: row.type,
      payload: row.payload,
      createdAt: row.created_at,
    }));
  }

  async completeCommand(
    controllerId: number,
    commandId: string,
    dto: GateCommandResultDto,
  ) {
    let id: bigint;
    try {
      id = BigInt(commandId);
    } catch {
      throw new BadRequestException('Invalid command id');
    }
    const row = await this.prisma.gate_commands.findFirst({
      where: { id, controller_id: controllerId },
    });
    if (!row) throw new NotFoundException('Gate command not found');
    await this.prisma.gate_commands.update({
      where: { id },
      data: {
        status: dto.status,
        result: dto.result ? jsonObject(dto.result) : Prisma.JsonNull,
        completed_at: new Date(),
      },
    });
    return { ok: true };
  }

  async commandStatus(controllerId: number, commandId: string, user?: JwtUser) {
    await this.controllerOrThrow(controllerId, user);
    if (!/^\d+$/.test(commandId)) throw new BadRequestException('Invalid command id');
    const row = await this.prisma.gate_commands.findFirst({
      where: { id: BigInt(commandId), controller_id: controllerId },
    });
    if (!row) throw new NotFoundException('Gate command not found');
    const expired = ['pending', 'delivered'].includes(row.status) && Date.now() - row.created_at.getTime() > 15_000;
    return {
      id: row.id.toString(),
      status: expired ? 'failed' : row.status,
      result: expired ? { reason: 'expired_or_unacknowledged' } : row.result,
    };
  }
}
