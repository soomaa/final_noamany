import { mkdtempSync, readdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { detectRecording, recordingDuration, recordingView, retentionDays } from './recording-media';
import { TrainingRecordingsService } from './training-recordings.service';
import { TrainingService } from './training.service';

const m4a = Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from('ftypM4A '), Buffer.alloc(24)]);
const mov = Buffer.concat([Buffer.from([0, 0, 0, 0x14]), Buffer.from('ftypqt  '), Buffer.alloc(24)]);
const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(28)]);
const coach = { sub: 9, level: 1, branch: 10 } as JwtUser;

describe('Recording validation', () => {
  it('detects containers from bytes, not the declared type', () => {
    expect(detectRecording(m4a, 'audio')).toEqual({ ext: 'm4a', mime: 'audio/mp4' });
    expect(detectRecording(mov, 'video')).toEqual({ ext: 'mov', mime: 'video/quicktime' });
    expect(detectRecording(webm, 'audio')?.mime).toBe('audio/webm');
    expect(detectRecording(Buffer.from('ID3\x03\x00\x00\x00\x00\x00\x00\x00\x00'), 'audio')?.mime).toBe('audio/mpeg');
    expect(detectRecording(Buffer.from('%PDF-1.4 not media'), 'audio')).toBeNull();
    expect(detectRecording(Buffer.from('ID3\x03\x00\x00\x00\x00\x00\x00\x00\x00'), 'video')).toBeNull();
  });

  it('limits retention choices and video length', () => {
    expect(retentionDays(undefined)).toBe(14);
    expect(retentionDays('30')).toBe(30);
    expect(() => retentionDays(365)).toThrow();
    expect(recordingDuration(60, 'video')).toBe(60);
    expect(() => recordingDuration(61, 'video')).toThrow();
    expect(recordingDuration(null, 'audio')).toBeNull();
  });

  it('hides the link once expired or deleted', () => {
    const base = { id: 'r', day_id: 'd1', assignment_id: 1, kind: 'audio', mime: 'audio/mp4', bytes: 10, duration_seconds: 5, storage_key: 'r.m4a', share_token: 't'.repeat(43), note: '', deleted_at: null, created_at: new Date('2026-10-01') };
    expect(recordingView({ ...base, expires_at: new Date(Date.now() + 1000) }).url).toBe(`/api/public/training-recordings/${'t'.repeat(43)}`);
    expect(recordingView({ ...base, expires_at: new Date(Date.now() - 1000) })).toMatchObject({ expired: true, url: null });
    expect(recordingView({ ...base, storage_key: null, expires_at: new Date(Date.now() + 1000) })).toMatchObject({ expired: true, url: null });
  });
});

describe('TrainingRecordingsService', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'noamany-rec-')); process.env.TRAINING_STORAGE_DIR = dir; });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function fixture() {
    const rows: Record<string, unknown>[] = [];
    const db = {
      training_assignments: { findFirst: jest.fn().mockResolvedValue({ id: 3, snapshot: { days: [{ id: 'd1' }] } }) },
      training_recordings: {
        create: jest.fn(({ data }) => { const row = { ...data, deleted_at: null, created_at: new Date() }; rows.push(row); return Promise.resolve(row); }),
        findUnique: jest.fn(({ where }) => Promise.resolve(rows.find((r) => r.share_token === where.share_token) ?? null)),
        findMany: jest.fn(() => Promise.resolve(rows.filter((r) => !r.deleted_at && (r.expires_at as Date) <= new Date()))),
        update: jest.fn(({ where, data }) => { Object.assign(rows.find((r) => r.id === where.id)!, data); return Promise.resolve({}); }),
      },
    };
    const training = { assertAccess: jest.fn().mockResolvedValue({ id: 1, branch_id: 10 }) };
    return { rows, db, training, service: new TrainingRecordingsService(db as unknown as PrismaService, training as unknown as TrainingService) };
  }
  const file = (buffer: Buffer) => ({ buffer } as Express.Multer.File);

  it('stores a voice note privately and serves it by token until it expires', async () => {
    const { rows, training, service } = fixture();
    const view = await service.create(1, { kind: 'audio', dayId: 'd1', retentionDays: '7', durationSeconds: '12' }, file(m4a), coach);
    expect(training.assertAccess).toHaveBeenCalledWith(1, coach);
    expect(view).toMatchObject({ kind: 'audio', mime: 'audio/mp4', dayId: 'd1', durationSeconds: 12, expired: false });
    expect(rows[0]).toMatchObject({ branch_id: 10, member_id: 1 });
    const token = String(rows[0].share_token);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(readdirSync(join(dir, 'private', 'training-recordings'))).toEqual([`${rows[0].id}.m4a`]);
    expect((await service.shared(token)).mime).toBe('audio/mp4');
    rows[0].expires_at = new Date(Date.now() - 1);
    await expect(service.shared(token)).rejects.toThrow();
    await expect(service.shared('../../etc/passwd')).rejects.toThrow();
  });

  it('rejects unknown days, oversized video and non-media files', async () => {
    const { service } = fixture();
    await expect(service.create(1, { kind: 'audio', dayId: 'nope' }, file(m4a), coach)).rejects.toThrow('اليوم غير موجود');
    await expect(service.create(1, { kind: 'video', dayId: 'd1' }, file(Buffer.concat([mov, Buffer.alloc(21 * 1024 * 1024)])), coach)).rejects.toThrow('20');
    await expect(service.create(1, { kind: 'audio', dayId: 'd1' }, file(Buffer.from('not a recording at all')), coach)).rejects.toThrow('غير مدعومة');
  });

  it('expiry job deletes the file and keeps the row as expired', async () => {
    const { rows, service } = fixture();
    await service.create(1, { kind: 'audio', dayId: 'd1' }, file(m4a), coach);
    rows[0].expires_at = new Date(Date.now() - 1);
    expect(await service.purgeExpired()).toBe(1);
    expect(readdirSync(join(dir, 'private', 'training-recordings'))).toEqual([]);
    expect(rows[0]).toMatchObject({ storage_key: null });
    expect(recordingView(rows[0] as never).expired).toBe(true);
  });
});
