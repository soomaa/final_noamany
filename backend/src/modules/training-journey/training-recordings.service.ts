import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { spawn, spawnSync } from 'child_process';
import { randomBytes, randomUUID } from 'crypto';
import { mkdir, rm, stat, unlink, writeFile } from 'fs/promises';
import { isAbsolute, join, resolve, sep } from 'path';
import { runWithMysqlLock } from '../../common/automation/cron-dedup.util';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import * as D from './training-domain';
import { TrainingService } from './training.service';
import {
  RECORDING_LIMITS,
  SHARE_TOKEN,
  detectRecording,
  recordingDuration,
  recordingKind,
  recordingView,
  retentionDays,
} from './recording-media';

/**
 * Recordings are private: `<TRAINING_STORAGE_DIR | ./storage>/private/training-recordings`.
 * That folder is outside the static `/uploads` directory, so a file is only ever served
 * through an unexpired share token (Noamany is single-tenant; Gymora used a per-tenant root).
 */
const FOLDER = ['private', 'training-recordings'] as const;
function storageRoot() {
  const base = process.env.TRAINING_STORAGE_DIR ?? './storage';
  return isAbsolute(base) ? base : join(process.cwd(), base);
}
let ffmpegAvailable: boolean | undefined;
function hasFfmpeg() {
  if (ffmpegAvailable === undefined) {
    const probe = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore', timeout: 5000 });
    ffmpegAvailable = probe.status === 0;
  }
  return ffmpegAvailable;
}

/** iPhones do not play WebM/Ogg audio; convert to AAC (.m4a) when ffmpeg is installed. */
function toM4a(input: string, output: string) {
  return new Promise<boolean>((done) => {
    const child = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-i', input, '-vn', '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', output], { stdio: 'ignore' });
    const timer = setTimeout(() => child.kill('SIGKILL'), 90_000);
    child.on('error', () => { clearTimeout(timer); done(false); });
    child.on('close', (code) => { clearTimeout(timer); done(code === 0); });
  });
}

@Injectable()
export class TrainingRecordingsService {
  private readonly logger = new Logger(TrainingRecordingsService.name);
  constructor(
    private readonly db: PrismaService,
    private readonly training: TrainingService,
  ) {}

  /** Private recordings folder (never under the public uploads directory). */
  private root() {
    return resolve(storageRoot(), ...FOLDER);
  }
  private path(storageKey: string) {
    const root = this.root(), target = resolve(root, storageKey);
    if (!target.startsWith(`${root}${sep}`)) throw new BadRequestException('مسار ملف غير صالح');
    return target;
  }

  async list(memberId: number, user: JwtUser) {
    const member = await this.training.assertAccess(memberId, user);
    const rows = await this.db.training_recordings.findMany({ where: { member_id: memberId, branch_id: member.branch_id }, orderBy: { created_at: 'desc' }, take: 100 });
    return rows.map((row) => recordingView(row));
  }

  async create(memberId: number, body: Record<string, unknown>, file: Express.Multer.File | undefined, user: JwtUser) {
    const member = await this.training.assertAccess(memberId, user);
    if (!file?.buffer?.length) throw new BadRequestException('أرفق التسجيل');
    const kind = recordingKind(body.kind);
    if (file.buffer.length > RECORDING_LIMITS[kind]) {
      throw new BadRequestException(kind === 'video' ? 'الفيديو بحد أقصى 20 ميجا' : 'التسجيل الصوتي بحد أقصى 10 ميجا');
    }
    let container = detectRecording(file.buffer, kind);
    if (!container) throw new BadRequestException(kind === 'video' ? 'صيغة الفيديو غير مدعومة (MP4 أو MOV أو WebM)' : 'صيغة الصوت غير مدعومة (M4A أو MP3 أو WebM أو OGG أو WAV)');
    const assignment = await this.db.training_assignments.findFirst({ where: { member_id: memberId, is_active: true }, orderBy: { id: 'desc' } });
    if (!assignment) throw new BadRequestException('أسند برنامجًا للعميل أولًا');
    const dayId = D.text(body.dayId, 80, true);
    const days = ((assignment.snapshot as { days?: Array<{ id: string }> } | null)?.days ?? []);
    if (!days.some((d) => d.id === dayId)) throw new BadRequestException('اليوم غير موجود في برنامج العميل');
    const durationSeconds = recordingDuration(body.durationSeconds, kind);
    const keepDays = retentionDays(body.retentionDays);

    const id = randomUUID();
    await mkdir(this.root(), { recursive: true, mode: 0o700 });
    let storageKey = `${id}.${container.ext}`;
    let bytes = file.buffer.length;
    await writeFile(this.path(storageKey), file.buffer, { flag: 'wx', mode: 0o600 });
    if (kind === 'audio' && (container.ext === 'webm' || container.ext === 'ogg') && hasFfmpeg()) {
      const converted = `${id}.m4a`;
      if (await toM4a(this.path(storageKey), this.path(converted))) {
        const size = (await stat(this.path(converted))).size;
        if (size > 0) {
          await unlink(this.path(storageKey)).catch(() => undefined);
          storageKey = converted; bytes = size; container = { ext: 'm4a', mime: 'audio/mp4' };
        }
      } else {
        await rm(this.path(converted), { force: true });
        this.logger.warn(`Recording ${id} kept as ${container.ext}; conversion failed`);
      }
    }
    try {
      const row = await this.db.training_recordings.create({
        data: {
          id,
          member_id: memberId,
          branch_id: member.branch_id,
          assignment_id: assignment.id,
          day_id: dayId,
          kind,
          mime: container.mime,
          bytes,
          duration_seconds: durationSeconds,
          storage_key: storageKey,
          share_token: randomBytes(32).toString('base64url'),
          note: D.text(body.note, 500),
          expires_at: new Date(Date.now() + keepDays * 86_400_000),
          created_by: user.sub,
        },
      });
      return recordingView(row);
    } catch (error) {
      await rm(this.path(storageKey), { force: true });
      throw error;
    }
  }

  async remove(memberId: number, id: string, user: JwtUser) {
    const member = await this.training.assertAccess(memberId, user);
    const row = await this.db.training_recordings.findFirst({ where: { id: D.text(id, 36, true), member_id: memberId, branch_id: member.branch_id } });
    if (!row) throw new NotFoundException('التسجيل غير موجود');
    if (row.storage_key) await rm(this.path(row.storage_key), { force: true });
    await this.db.training_recordings.update({ where: { id: row.id }, data: { storage_key: null, deleted_at: new Date() } });
    return { success: true };
  }

  /** Public link (QR / WhatsApp): only an unexpired, undeleted recording is served. */
  async shared(token: string) {
    if (!SHARE_TOKEN.test(token)) throw new NotFoundException('التسجيل غير متاح');
    const row = await this.db.training_recordings.findUnique({ where: { share_token: token } });
    if (!row || row.deleted_at || !row.storage_key || row.expires_at <= new Date()) throw new NotFoundException('انتهت صلاحية التسجيل');
    return { path: this.path(row.storage_key), mime: row.mime };
  }

  /** Deletes expired files; rows stay with storage_key NULL so apps show "expired". */
  async purgeExpired(now = new Date()) {
    const rows = await this.db.training_recordings.findMany({
      where: { deleted_at: null, expires_at: { lte: now } },
      select: { id: true, storage_key: true },
      take: 500,
    });
    for (const row of rows) {
      if (row.storage_key) await rm(this.path(row.storage_key), { force: true });
      await this.db.training_recordings.update({ where: { id: row.id }, data: { storage_key: null, deleted_at: now } });
    }
    if (rows.length) this.logger.log(`Deleted ${rows.length} expired training recording(s)`);
    return rows.length;
  }

  /** Hourly; a MySQL lock keeps a single instance doing the cleanup. */
  @Cron('20 * * * *')
  async purgeExpiredHourly() {
    const ran = await runWithMysqlLock(this.db, 'cron:training-recordings-expiry', 0, () => this.purgeExpired());
    if (ran === null) this.logger.debug('Skipped training-recordings expiry; another instance holds the lock');
  }
}
