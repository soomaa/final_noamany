import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { resolveCorrelationId } from '../common/http/correlation-id';
import { RequestContextService } from '../common/http/request-context.service';
import { RequestMetricsService } from '../common/metrics/request-metrics.service';
import { PortableHrModule } from './portable-hr.module';

export async function createPortableHrApp(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(PortableHrModule);
  const config = app.get(ConfigService);
  const context = app.get(RequestContextService);
  const metrics = app.get(RequestMetricsService);
  app.setGlobalPrefix('api');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' }, contentSecurityPolicy: false }));
  app.use(cookieParser());
  app.use((req: Request, res: Response, next: NextFunction) => {
    const correlationId = resolveCorrelationId(req.get('x-request-id'));
    (req as Request & { correlationId: string }).correlationId = correlationId;
    res.setHeader('X-Request-ID', correlationId);
    context.run({ correlationId }, next);
  });
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = process.hrtime.bigint();
    const finish = metrics.startRequest(req.method);
    res.once('finish', () => finish(res.statusCode, Number(process.hrtime.bigint() - start) / 1_000_000));
    next();
  });
  app.use(compression());
  app.enableCors({ origin: config.get<string[]>('corsOrigins'), credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
  return app;
}

export async function bootstrapPortableHr(): Promise<void> {
  const app = await createPortableHrApp();
  const config = app.get(ConfigService);
  await app.listen(config.get<number>('port') ?? 4000);
}
