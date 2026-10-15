import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue, Worker } from 'bullmq';

export const WEBHOOK_DELIVER_JOB = 'webhook.deliver';

type JobHandler = (data: unknown) => Promise<void>;

type RedisConnection = { url: string; maxRetriesPerRequest: null };

@Injectable()
export class JobQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(JobQueueService.name);
  private readonly handlers = new Map<string, JobHandler>();
  private readonly queues = new Map<string, Queue>();
  private readonly workers = new Map<string, Worker>();
  private connection: RedisConnection | null = null;
  private redisEnabled = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const redisUrl = this.config.get<string>('redis.url') ?? process.env.REDIS_URL;
    if (!redisUrl) {
      this.log.log('REDIS_URL not set — jobs run in-process');
      return;
    }

    this.connection = { url: redisUrl, maxRetriesPerRequest: null };
    this.redisEnabled = true;
    this.log.log('BullMQ connected via REDIS_URL');

    for (const [name, handler] of this.handlers) {
      this.startWorker(name, handler);
    }
  }

  async onModuleDestroy() {
    for (const worker of this.workers.values()) {
      await worker.close();
    }
    for (const queue of this.queues.values()) {
      await queue.close();
    }
  }

  register(name: string, handler: JobHandler): void {
    this.handlers.set(name, handler);
    if (this.redisEnabled && this.connection) {
      this.startWorker(name, handler);
    }
  }

  private startWorker(name: string, handler: JobHandler) {
    if (!this.connection || this.workers.has(name)) return;

    const queue = new Queue(name, { connection: this.connection });
    this.queues.set(name, queue);

    const worker = new Worker(
      name,
      async (job: Job) => handler(job.data),
      { connection: this.connection, concurrency: 5 },
    );

    worker.on('failed', (job, err) => {
      this.log.error(`Job ${name}#${job?.id} failed: ${err.message}`);
    });

    this.workers.set(name, worker);
    this.log.log(`Worker registered: ${name}`);
  }

  async enqueue(name: string, data: unknown, opts?: { jobId?: string }): Promise<void> {
    const handler = this.handlers.get(name);
    if (!handler) {
      this.log.warn(`No handler registered for job "${name}"`);
      return;
    }

    const queue = this.queues.get(name);
    if (queue && this.redisEnabled) {
      await queue.add(name, data, {
        jobId: opts?.jobId,
        attempts: 5,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      });
      return;
    }

    setImmediate(async () => {
      try {
        await handler(data);
      } catch (e) {
        this.log.error(`Inline job "${name}" failed: ${e instanceof Error ? e.message : e}`);
      }
    });
  }

  isRedisEnabled(): boolean {
    return this.redisEnabled;
  }
}
