import { BadRequestException } from '@nestjs/common';

export type RecordingKind = 'audio' | 'video';
export const RECORDING_LIMITS: Record<RecordingKind, number> = {
  audio: 10 * 1024 * 1024,
  video: 20 * 1024 * 1024,
};
export const RECORDING_RETENTION_DAYS = [7, 14, 30] as const;
export const RECORDING_DEFAULT_DAYS = 14;
export const RECORDING_MAX_SECONDS: Record<RecordingKind, number> = { audio: 600, video: 60 };

interface Container { ext: string; mime: string }

/** Container from magic bytes; the browser-declared type is never trusted. */
export function detectRecording(buffer: Buffer, kind: RecordingKind): Container | null {
  if (buffer.length < 12) return null;
  const ascii = (start: number, end: number) => buffer.subarray(start, end).toString('latin1');
  if (ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12);
    if (kind === 'audio') return { ext: 'm4a', mime: 'audio/mp4' };
    return brand === 'qt  ' ? { ext: 'mov', mime: 'video/quicktime' } : { ext: 'mp4', mime: 'video/mp4' };
  }
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return kind === 'audio' ? { ext: 'webm', mime: 'audio/webm' } : { ext: 'webm', mime: 'video/webm' };
  }
  if (kind === 'video') return null;
  if (ascii(0, 4) === 'OggS') return { ext: 'ogg', mime: 'audio/ogg' };
  if (ascii(0, 3) === 'ID3' || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)) return { ext: 'mp3', mime: 'audio/mpeg' };
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') return { ext: 'wav', mime: 'audio/wav' };
  return null;
}

export function recordingKind(value: unknown): RecordingKind {
  if (value !== 'audio' && value !== 'video') throw new BadRequestException('نوع التسجيل غير صالح');
  return value;
}

export function retentionDays(value: unknown): number {
  if (value == null || value === '') return RECORDING_DEFAULT_DAYS;
  const days = Number(value);
  if (!(RECORDING_RETENTION_DAYS as readonly number[]).includes(days)) throw new BadRequestException('اختر مدة الاحتفاظ: 7 أو 14 أو 30 يومًا');
  return days;
}

export function recordingDuration(value: unknown, kind: RecordingKind): number | null {
  if (value == null || value === '') return null;
  const seconds = Math.round(Number(value));
  if (!Number.isFinite(seconds) || seconds < 0) throw new BadRequestException('مدة التسجيل غير صالحة');
  if (seconds > RECORDING_MAX_SECONDS[kind]) {
    throw new BadRequestException(kind === 'video' ? 'الفيديو بحد أقصى 60 ثانية' : 'التسجيل الصوتي بحد أقصى 10 دقائق');
  }
  return seconds;
}

export const SHARE_TOKEN = /^[A-Za-z0-9_-]{43}$/;

export interface RecordingRow {
  id: string;
  day_id: string;
  assignment_id: number | null;
  kind: string;
  mime: string;
  bytes: number;
  duration_seconds: number | null;
  storage_key: string | null;
  share_token: string;
  note: string;
  expires_at: Date;
  deleted_at: Date | null;
  created_at: Date;
}

/** What apps see. `url` is a private, unguessable link that stops working at expiry. */
export function recordingView(row: RecordingRow, now = new Date()) {
  const expired = !!row.deleted_at || !row.storage_key || row.expires_at <= now;
  return {
    id: row.id,
    dayId: row.day_id,
    assignmentId: row.assignment_id,
    kind: row.kind,
    mime: row.mime,
    bytes: row.bytes,
    durationSeconds: row.duration_seconds,
    note: row.note,
    expiresAt: row.expires_at.toISOString(),
    createdAt: row.created_at.toISOString(),
    expired,
    url: expired ? null : `/api/public/training-recordings/${row.share_token}`,
  };
}
