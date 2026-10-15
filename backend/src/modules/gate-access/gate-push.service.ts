import { ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { gate_controllers } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { GateAccessService } from './gate-access.service';
import {
  configResponse,
  handshakeResponse,
  pushVersionOf,
  registryResponse,
  isAccessRecord,
  localTimeToDate,
  openDoorCommand,
  parseCommandResults,
  parseRtlog,
  setTimeCommand,
  decodePushCardNo,
  timeResponse,
} from './zk-push.protocol';

/** Re-sync the controller clock this often; stale clocks make live scans look old. */
const TIME_SYNC_INTERVAL_MS = 6 * 60 * 60_000;
/** A controller that rejects the time command must not be asked again every second. */
const TIME_SYNC_RETRY_MS = 10 * 60_000;
/** Even a forced resync (after a reconnect) waits this long, so a registration loop cannot pile up commands. */
const TIME_SYNC_FORCED_GAP_MS = 60_000;
/** Polls arrive every second; persisting each one would be a write per second per gate. */
const SEEN_WRITE_INTERVAL_MS = 10_000;
const UNKNOWN_SERIAL_LOG_INTERVAL_MS = 5 * 60_000;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

@Injectable()
export class GatePushService {
  private readonly logger = new Logger('GatePush');
  private readonly lastSyncAttempt = new Map<number, number>();
  private readonly unknownSerialLoggedAt = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly gate: GateAccessService,
  ) {}

  /**
   * The push protocol carries no credential beyond the serial number, so a request is
   * accepted only for a controller an admin registered in push mode, and — when set —
   * only from the gym's public IP.
   */
  async authenticate(serial: string | undefined, ip: string): Promise<gate_controllers> {
    const sn = (serial ?? '').trim().toUpperCase();
    if (!/^[A-Z0-9]{4,80}$/.test(sn)) throw new UnauthorizedException('Missing SN');
    const controller = await this.prisma.gate_controllers.findUnique({ where: { serial_number: sn } });
    if (!controller || controller.connection_mode !== 'push') {
      const last = this.unknownSerialLoggedAt.get(sn) ?? 0;
      if (Date.now() - last > UNKNOWN_SERIAL_LOG_INTERVAL_MS) {
        this.unknownSerialLoggedAt.set(sn, Date.now());
        this.logger.warn(`Push request from unregistered controller SN=${sn} ip=${ip}`);
      }
      throw new UnauthorizedException('Unregistered device');
    }
    if (!controller.is_active) throw new ForbiddenException('Device disabled');
    if (controller.push_allowed_ip && controller.push_allowed_ip !== ip) {
      await this.recordError(controller, `رفض اتصال من IP غير مسموح: ${ip}`);
      throw new ForbiddenException('Source not allowed');
    }
    return controller;
  }

  private registryCode(controller: gate_controllers): string {
    return sha256(`one80-registry:${controller.id}:${controller.serial_number}`).slice(0, 10);
  }

  /** Marks the controller online without writing on every one-second poll. */
  private async touch(controller: gate_controllers, ip: string, extra: Partial<gate_controllers> = {}) {
    const stale = !controller.last_seen_at || Date.now() - controller.last_seen_at.getTime() > SEEN_WRITE_INTERVAL_MS;
    const changed = controller.status !== 'online' || controller.push_last_ip !== ip;
    if (!stale && !changed && Object.keys(extra).length === 0) return;
    // last_error is left alone: a rejected command must stay visible past the next poll.
    await this.prisma.gate_controllers.update({
      where: { id: controller.id },
      data: { status: 'online', last_seen_at: new Date(), push_last_ip: ip, ...extra },
    });
  }

  private async recordError(controller: gate_controllers, message: string) {
    await this.prisma.gate_controllers.update({
      where: { id: controller.id },
      data: { last_error: message.slice(0, 500) },
    });
  }

  private async maybeQueueTimeSync(controller: gate_controllers, force = false) {
    const synced = controller.last_time_sync_at?.getTime() ?? 0;
    if (!force && Date.now() - synced < TIME_SYNC_INTERVAL_MS) return;
    const attempted = this.lastSyncAttempt.get(controller.id) ?? 0;
    if (Date.now() - attempted < (force ? TIME_SYNC_FORCED_GAP_MS : TIME_SYNC_RETRY_MS)) return;
    this.lastSyncAttempt.set(controller.id, Date.now());
    await this.gate.enqueueCommand(controller.id, 'sync_time', {});
  }

  /** `GET /iclock/cdata?options=all` — sent at power-up and after every reconnect. */
  async handshake(controller: gate_controllers, ip: string, pushVersion?: string) {
    // A fresh handshake is a fresh start, so an old error no longer describes the device.
    await this.touch(controller, ip, {
      last_error: null,
      ...(pushVersion ? { agent_version: `push ${pushVersion}`.slice(0, 40) } : {}),
    });
    // A restarted controller may have lost its clock; resync now rather than in six hours.
    await this.maybeQueueTimeSync(controller, true);
    return handshakeResponse({
      serialNumber: controller.serial_number!,
      registryCode: this.registryCode(controller),
      pushVersion: pushVersionOf(pushVersion ?? controller.agent_version),
    });
  }

  /** `GET /iclock/push` — configuration download after registration. */
  async config(controller: gate_controllers, ip: string) {
    await this.touch(controller, ip);
    return configResponse({
      serialNumber: controller.serial_number!,
      pushVersion: pushVersionOf(controller.agent_version),
    });
  }

  /** `POST /iclock/registry` — device parameters as `key=value` pairs separated by commas. */
  async registry(controller: gate_controllers, ip: string, body: string) {
    const fields: Record<string, string> = {};
    for (const pair of body.split(/[,\n\t]/)) {
      const separator = pair.indexOf('=');
      if (separator > 0) fields[pair.slice(0, separator).trim().replace(/^~/, '').toLowerCase()] = pair.slice(separator + 1).trim();
    }
    const firmware = fields.firmver ?? fields.firmwareversion;
    await this.touch(controller, ip, firmware ? { firmware_version: firmware.slice(0, 80) } : {});
    return registryResponse(this.registryCode(controller));
  }

  /** `GET /iclock/getrequest` — the heartbeat; the reply carries any queued commands. */
  async getRequest(controller: gate_controllers, ip: string) {
    await this.touch(controller, ip);
    await this.maybeQueueTimeSync(controller);
    const commands = await this.gate.takeCommands(controller.id);
    const lines: string[] = [];
    for (const command of commands) {
      const payload = (command.payload ?? {}) as { doorNo?: number; seconds?: number };
      try {
        if (command.type === 'open_door') {
          lines.push(openDoorCommand(command.id, Number(payload.doorNo), Number(payload.seconds ?? 1)));
        } else if (command.type === 'sync_time') {
          // Built at delivery so the controller receives the time of the poll, not of the queueing.
          lines.push(setTimeCommand(command.id, new Date(), controller.timezone));
        } else {
          await this.gate.completeCommand(controller.id, command.id, { status: 'failed', result: { reason: 'unsupported_in_push_mode' } });
        }
      } catch (error) {
        await this.gate.completeCommand(controller.id, command.id, {
          status: 'failed', result: { reason: error instanceof Error ? error.message : 'invalid_command' },
        });
      }
    }
    return lines.length ? lines.join('\n') : 'OK';
  }

  /** `POST /iclock/devicecmd` — `ID=…&Return=…&CMD=…`; a negative Return is a device error. */
  async commandResults(controller: gate_controllers, ip: string, body: string) {
    await this.touch(controller, ip);
    for (const result of parseCommandResults(body)) {
      const ok = result.returnCode != null && result.returnCode >= 0;
      const row = await this.prisma.gate_commands.findFirst({
        where: { id: BigInt(result.id), controller_id: controller.id },
        select: { type: true },
      });
      if (!row) continue;
      await this.gate.completeCommand(controller.id, result.id, {
        status: ok ? 'completed' : 'failed',
        result: { returnCode: result.returnCode, cmd: result.cmd },
      });
      if (row.type === 'sync_time' && ok) {
        await this.prisma.gate_controllers.update({ where: { id: controller.id }, data: { last_time_sync_at: new Date() } });
      }
      if (!ok) {
        await this.recordError(controller, `الكنترول رفض الأمر ${result.cmd || row.type} (كود ${result.returnCode ?? '?'})`);
      }
    }
    return 'OK';
  }

  /**
   * `POST /iclock/cdata?table=rtlog` — live scans. Each one goes through the same decision
   * path as the Windows agent; an approved unregistered-card scan (27) is answered by
   * queueing the opening, which the controller collects on its next one-second poll.
   */
  async realtimeLog(controller: gate_controllers, ip: string, body: string) {
    await this.touch(controller, ip);
    const hexSerials = (process.env.ONE80_GATE_HEX_SERIALS ?? '').split(',').map(s => s.trim().toUpperCase());
    const hexadecimal = hexSerials.includes(controller.serial_number?.toUpperCase() ?? '');
    for (const record of parseRtlog(body)) {
      if (!isAccessRecord(record)) continue;
      const occurredAt = localTimeToDate(record.time, controller.timezone);
      if (!occurredAt) {
        this.logger.warn(`Unparseable push time "${record.time}" from SN=${controller.serial_number}`);
        continue;
      }
      const result = await this.gate.ingestEvent(controller.id, {
        // A retried upload repeats the line byte for byte, so the line is the identity.
        fingerprint: sha256(`push:${controller.serial_number}:${record.raw}`),
        occurredAt: occurredAt.toISOString(),
        credentialNo: decodePushCardNo(record.cardNo, hexadecimal) || undefined,
        doorNo: record.doorNo ?? undefined,
        eventType: record.eventType,
        inOutState: record.inOutState ?? undefined,
        verifyMode: record.verifyMode ?? undefined,
        pin: record.pin || undefined,
      });
      if ('openDoor' in result && result.openDoor && 'doorNo' in result && result.doorNo) {
        await this.gate.enqueueCommand(controller.id, 'open_door', {
          doorNo: result.doorNo, seconds: result.seconds ?? 1, eventId: result.eventId,
        });
      }
    }
    return 'OK';
  }

  async deviceTime(controller: gate_controllers, ip: string) {
    await this.touch(controller, ip);
    return timeResponse(new Date(), controller.timezone);
  }

  /** Other cdata tables (door state, stored transactions, options) are acknowledged. */
  async otherData(controller: gate_controllers, ip: string, table: string | undefined, body: string) {
    await this.touch(controller, ip);
    if (table && table !== 'rtstate') {
      const lines = body.split(/\r?\n/).filter((line) => line.trim()).length;
      this.logger.log(`SN=${controller.serial_number} uploaded ${lines} line(s) of table=${table}`);
    }
    return 'OK';
  }

  /** `options=all` separates the handshake from an ordinary data GET. */
  isHandshake(query: Record<string, string | undefined>) {
    return (query.options ?? '').toLowerCase() === 'all';
  }
}
