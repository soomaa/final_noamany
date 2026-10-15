/**
 * ZKTeco access-control PUSH protocol (the "HTTP" communication type in ZKBio for
 * INBIO / C3 Pro panels). The controller is the HTTP client: it polls the server under
 * `/iclock/*`, posts real-time events as tab-separated `key=value` lines, and receives
 * commands as `C:<id>:<command>` lines. Everything here is pure so it can be tested
 * without a device; the transport lives in gate-push.controller.ts.
 */

/** Seconds between the controller's command polls. Also bounds the open-door latency. */
export const PUSH_REQUEST_DELAY_SECONDS = 1;

/** One real-time record from `POST /iclock/cdata?table=rtlog`. */
export interface ZkRtlogRecord {
  /** Controller-local wall clock, `YYYY-MM-DD HH:mm:ss`. */
  time: string;
  pin: string;
  cardNo: string;
  doorNo: number | null;
  eventType: number;
  inOutState: number | null;
  verifyMode: number | null;
  index: string;
  raw: string;
}

/** Splits one push record into its fields. Accepts tab- or `&`-separated pairs. */
export function parsePushFields(line: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const pair of line.split(/\t|&/)) {
    const separator = pair.indexOf('=');
    if (separator <= 0) continue;
    fields[pair.slice(0, separator).trim().toLowerCase()] = pair.slice(separator + 1).trim();
  }
  return fields;
}

function intOrNull(value: string | undefined): number | null {
  if (value == null || !/^-?\d+$/.test(value)) return null;
  return Number(value);
}

/**
 * Card numbers arrive as the controller decoded them. Scanners that pass the barcode
 * text through keep letters (a membership code such as B001352); Wiegand readers send
 * digits. Anything else is dropped rather than stored, since it may be line noise.
 */
export function normalizeCardNo(value: string | undefined): string {
  const card = (value ?? '').trim();
  if (!card || !/^[A-Za-z0-9]{1,20}$/.test(card)) return '';
  if (/^\d+$/.test(card)) return card.replace(/^0+/, '');
  return card.toUpperCase();
}

/** Explicit per-controller encoding: never guess from the presence of A–F. */
export function decodePushCardNo(value: string, hexadecimal: boolean): string {
  if (!hexadecimal || !value) return value;
  if (!/^[0-9A-Fa-f]{1,16}$/.test(value)) return '';
  const decimal = BigInt(`0x${value}`);
  return decimal > 0n ? decimal.toString(10) : '';
}

/** Firmware may request UTC packed time and an explicit server offset after SET OPTIONS. */
export function timeResponse(now: Date, timeZone: string): string {
  const offset = utcOffsetMinutes(now, timeZone);
  const absolute = Math.abs(offset);
  const zone = `${offset < 0 ? '-' : '+'}${String(Math.floor(absolute / 60)).padStart(2, '0')}${String(absolute % 60).padStart(2, '0')}`;
  return `DateTime=${zkPackedTime(localParts(now, 'UTC'))},ServerTZ=${zone}\n`;
}

export function parseRtlog(body: string): ZkRtlogRecord[] {
  const records: ZkRtlogRecord[] = [];
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const fields = parsePushFields(line);
    const eventType = intOrNull(fields.event);
    if (!fields.time || eventType == null) continue;
    const door = intOrNull(fields.eventaddr ?? fields.door);
    records.push({
      time: fields.time,
      pin: fields.pin ?? '',
      cardNo: normalizeCardNo(fields.cardno),
      doorNo: door != null && door >= 1 && door <= 4 ? door : null,
      eventType,
      inOutState: intOrNull(fields.inoutstatus),
      verifyMode: intOrNull(fields.verifytype),
      index: fields.index ?? '',
      raw: line,
    });
  }
  return records;
}

/**
 * Door-sensor, alarm and start-up records share the rtlog channel with scans. Only a
 * record that names a person — or a remote opening (8) — is an access event; the rest
 * would otherwise fill the gate log with "unknown credential" denials.
 */
export function isAccessRecord(record: ZkRtlogRecord): boolean {
  if (record.eventType === 255 || record.eventType >= 200) return false;
  if (record.eventType === 8) return true;
  return record.cardNo !== '' || (record.pin !== '' && record.pin !== '0');
}

/** `ID=12&Return=0&CMD=CONTROL DEVICE`, one per line. `Return` < 0 is a device error. */
export function parseCommandResults(body: string) {
  const results: Array<{ id: string; returnCode: number | null; cmd: string }> = [];
  for (const raw of body.split(/\r?\n/)) {
    const fields = parsePushFields(raw.trim());
    if (!fields.id || !/^\d+$/.test(fields.id)) continue;
    results.push({ id: fields.id, returnCode: intOrNull(fields.return), cmd: fields.cmd ?? '' });
  }
  return results;
}

function twoHex(value: number): string {
  return value.toString(16).toUpperCase().padStart(2, '0');
}

/**
 * `CONTROL DEVICE AABBCCDD`: AA = 01 (output), BB = door, CC = 01 (door lock relay,
 * 02 would be an auxiliary output), DD = seconds open (FF would latch it open, which
 * this server never sends).
 */
export function openDoorCommand(commandId: string, doorNo: number, seconds: number): string {
  if (!Number.isInteger(doorNo) || doorNo < 1 || doorNo > 4) throw new Error('Invalid door');
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 5) throw new Error('Invalid pulse');
  return `C:${commandId}:CONTROL DEVICE 01${twoHex(doorNo)}01${twoHex(seconds)}`;
}

/** ZKTeco packs local time into one integer: 31-day months, 12-month years from 2000. */
export function zkPackedTime(parts: LocalParts): number {
  const days = (parts.year - 2000) * 12 * 31 + (parts.month - 1) * 31 + (parts.day - 1);
  return days * 86_400 + parts.hour * 3_600 + parts.minute * 60 + parts.second;
}

export function setTimeCommand(commandId: string, now: Date, timeZone: string): string {
  return `C:${commandId}:SET OPTIONS DateTime=${zkPackedTime(localParts(now, timeZone))}`;
}

/**
 * Parameters shared by the start-up handshake and the configuration download. The
 * versions echo the controller's own push version: a server claiming a newer protocol
 * makes some firmwares try steps they then fail, and re-register every few seconds.
 * Every line, the last included, ends in \n — line-based firmware parsers need it.
 */
function serverParameters(input: { serialNumber: string; pushVersion: string }, versionKey: 'PushProtVer' | 'PushVersion') {
  return [
    `ServerVersion=${input.pushVersion}`,
    `ServerName=ADMS`,
    `${versionKey}=${input.pushVersion}`,
    `ErrorDelay=30`,
    `RequestDelay=${PUSH_REQUEST_DELAY_SECONDS}`,
    `TransTimes=00:00;14:00`,
    `TransInterval=1`,
    `TransTables=User Transaction`,
    `Realtime=1`,
    `SessionID=${input.serialNumber}`,
    `TimeoutSec=10`,
  ];
}

const lines = (rows: string[]) => `${rows.join('\n')}\n`;

/** Reply to the start-up handshake (`GET /iclock/cdata?options=all`). */
export function handshakeResponse(input: { serialNumber: string; registryCode: string; pushVersion: string }): string {
  return lines([`registry=ok`, `RegistryCode=${input.registryCode}`, ...serverParameters(input, 'PushProtVer')]);
}

/** Reply to the configuration download that follows registration (`GET /iclock/push`). */
export function configResponse(input: { serialNumber: string; pushVersion: string }): string {
  return lines(serverParameters(input, 'PushVersion'));
}

/** Reply to `POST /iclock/registry`. */
export function registryResponse(registryCode: string): string {
  return lines([`RegistryCode=${registryCode}`]);
}

/** The controller's push version from its handshake, e.g. "3.0.1"; 3.0.1 when unknown. */
export function pushVersionOf(value: string | null | undefined): string {
  const match = /(\d+\.\d+\.\d+)/.exec(value ?? '');
  return match ? match[1] : '3.0.1';
}

export interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const partFormatters = new Map<string, Intl.DateTimeFormat>();

export function localParts(date: Date, timeZone: string): LocalParts {
  let formatter = partFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    partFormatters.set(timeZone, formatter);
  }
  const values = Object.fromEntries(
    formatter.formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]),
  );
  return { year: values.year, month: values.month, day: values.day,
    hour: values.hour, minute: values.minute, second: values.second };
}

export function utcOffsetMinutes(date: Date, timeZone: string): number {
  const parts = localParts(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60_000);
}

/**
 * Converts the controller's wall clock to an instant. Resolving the offset at the
 * guessed instant (twice, to settle across a DST boundary) avoids a date library.
 */
export function localTimeToDate(value: string, timeZone: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match.map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi, s);
  let instant = wall - utcOffsetMinutes(new Date(wall), timeZone) * 60_000;
  instant = wall - utcOffsetMinutes(new Date(instant), timeZone) * 60_000;
  const result = new Date(instant);
  return Number.isNaN(result.getTime()) ? null : result;
}
