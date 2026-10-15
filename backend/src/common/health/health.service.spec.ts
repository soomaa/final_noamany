import { ServiceUnavailableException } from '@nestjs/common';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HealthService } from './health.service';

describe('HealthService', () => {
  let uploadDir: string;

  beforeEach(async () => {
    uploadDir = await mkdtemp(join(tmpdir(), 'hr-health-'));
  });

  afterEach(async () => {
    await rm(uploadDir, { recursive: true, force: true });
  });

  function service(db = jest.fn().mockResolvedValue([{ ok: 1 }])) {
    const prisma = { $queryRaw: db };
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'privateUploadDir') return uploadDir;
        if (key === 'redis.url') return null;
        return undefined;
      }),
    };
    return new HealthService(prisma as never, config as never);
  }

  it('keeps liveness process-only', () => {
    expect(service().liveness()).toEqual(expect.objectContaining({ status: 'ok' }));
  });

  it('reports database and private storage readiness', async () => {
    await expect(service().readiness()).resolves.toEqual(expect.objectContaining({
      status: 'ok',
      checks: expect.objectContaining({
        database: expect.objectContaining({ status: 'ok' }),
        privateStorage: expect.objectContaining({ status: 'ok' }),
        redis: expect.objectContaining({ status: 'disabled' }),
      }),
    }));
  });

  it('fails readiness closed when a required dependency is down', async () => {
    const health = service(jest.fn().mockRejectedValue(new Error('db unavailable')));
    await expect(health.readiness()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
