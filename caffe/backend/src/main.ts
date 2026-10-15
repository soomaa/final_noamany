import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import helmet from 'helmet';
import { existsSync } from 'fs';
import { join } from 'path';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { PrismaService } from './common/prisma/prisma.service';

// Legacy BigInt columns (e.g. employees.card_num) must serialize as strings in JSON.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');
  // Default helmet CSP blocks Vite inline bootstrap + Cloudflare beacon on production SPA.
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false,
    }),
  );
  app.use(cookieParser());
  // Compress JSON and static responses; list/report payloads benefit substantially.
  app.use(compression());

  app.enableCors({
    origin: config.get<string[]>('corsOrigins'),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Swagger exposes the entire API surface — keep it out of production.
  if (config.get<string>('nodeEnv') !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('ONE80 Gym ERP API')
      .setDescription('Gym management system — members, subscriptions, POS, HR, accounting')
      .setVersion('1.0')
      .addBearerAuth()
      .addCookieAuth('access_token')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  // Serve uploaded files (employee photos, documents, signatures).
  app.useStaticAssets(join(process.cwd(), config.get<string>('uploadDir') ?? './uploads'), {
    prefix: config.get<string>('publicUploadBase') ?? '/uploads',
  });

  // Serve the built frontend (single-origin deploy: this app hosts both the SPA and /api).
  // Place the frontend build in <cwd>/public. The SPA fallback below returns index.html for
  // client-side routes while leaving /api and /uploads to their handlers.
  const publicDir = join(process.cwd(), 'public');
  const indexHtml = join(publicDir, 'index.html');
  if (existsSync(indexHtml)) {
    app.useStaticAssets(publicDir, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('index.html')) {
          // Always revalidate the shell so deploys pick up new hashed assets.
          res.setHeader('Cache-Control', 'no-cache');
        } else if (filePath.includes(`${join('assets', '')}`)) {
          // Vite asset filenames are content-hashed and safe to cache permanently.
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    });
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'GET') return next();
      if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
      if (!req.headers.accept?.includes('text/html')) return next();
      return res.sendFile(indexHtml);
    });
  }

  // Lockout safety net: with fail-closed RBAC, a deploy that never ran the seed would
  // have zero super-admins and nobody could administer the system. Warn loudly (non-fatal).
  try {
    const prisma = app.get(PrismaService);
    const superAdmins = await prisma.rbac_user_roles.count({
      where: { role: { is_super_admin: true } },
    });
    if (superAdmins === 0) {
      console.warn(
        '\n⚠️  No super-admin user found. Run `npm run db:seed` to assign roles ' +
          '(by users.level) before going live — otherwise all users are locked out.\n',
      );
    }
  } catch {
    // DB not reachable yet / table missing — skip the check rather than block boot.
  }

  const port = config.get<number>('port') ?? 4000;
  await app.listen(port);

  console.log(`ONE80 HR API → http://localhost:${port}/api`);
}

bootstrap();
