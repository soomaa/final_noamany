import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve } from 'node:path';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';

type CheckStatus = 'ok' | 'error' | 'disabled';
type CheckResult = { status: CheckStatus; latencyMs?: number };

@Injectable()
export class HealthService {
  private readonly dependencyTimeoutMs = 2_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  liveness() {
    return {
      status: 'ok' as const,
      app: 'HR API',
      ts: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }

  async readiness() {
    const redisUrl = this.config.get<string | null>('redis.url');
    const [database, privateStorage, redis] = await Promise.all([
      this.runCheck(() => this.checkDatabase()),
      this.runCheck(() => this.checkPrivateStorage()),
      redisUrl
        ? this.runCheck(() => this.checkRedis(redisUrl))
        : Promise.resolve<CheckResult>({ status: 'disabled' }),
    ]);

    const checks = { database, privateStorage, redis };
    const failed = Object.values(checks).some((check) => check.status === 'error');
    const response = {
      status: failed ? ('error' as const) : ('ok' as const),
      ts: new Date().toISOString(),
      checks,
    };

    if (failed) {
      throw new ServiceUnavailableException(response);
    }
    return response;
  }

  private async checkDatabase(): Promise<void> {
    await this.prisma.$queryRaw`SELECT 1 AS ok`;
  }

  private async checkPrivateStorage(): Promise<void> {
    const configured = this.config.get<string>('privateUploadDir') ?? './private-uploads';
    await access(resolve(configured), constants.R_OK | constants.W_OK);
  }

  private async checkRedis(url: string): Promise<void> {
    const redis = new Redis(url, {
      lazyConnect: true,
      connectTimeout: 1_500,
      maxRetriesPerRequest: 0,
      enableOfflineQueue: false,
    });
    try {
      await redis.connect();
      await redis.ping();
    } finally {
      redis.disconnect(false);
    }
  }

  private async runCheck(check: () => Promise<void>): Promise<CheckResult> {
    const startedAt = Date.now();
    try {
      await this.withTimeout(check());
      return { status: 'ok', latencyMs: Date.now() - startedAt };
    } catch {
      return { status: 'error', latencyMs: Date.now() - startedAt };
    }
  }

  private async withTimeout<T>(promise: Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('dependency timeout')), this.dependencyTimeoutMs);
          timer.unref?.();
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
