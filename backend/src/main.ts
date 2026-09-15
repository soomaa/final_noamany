import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter, NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import helmet from 'helmet';
import { existsSync } from 'fs';
import { isAbsolute, join } from 'path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { AppModule } from './app.module';
import { PrismaService } from './common/prisma/prisma.service';
import { sensitiveUploadMounts } from './common/utils/sensitive-upload-path.util';

// Legacy BigInt columns (e.g. employees.card_num) must serialize as strings in JSON.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

async function bootstrap() {
  // Configure Express before Nest registers any controller. Setting this on the
  // adapter after NestFactory.create() is too late because the router already
  // exists, leaving /Api/:action able to capture lowercase /api/* requests.
  const expressServer = express();
  expressServer.set('case sensitive routing', true);
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    new ExpressAdapter(expressServer),
  );
  const config = app.get(ConfigService);

  // Keep the former CodeIgniter mobile contract reachable at root /Api/* while
  // all modern application routes remain under /api. Mutations in the legacy
  // adapter are still protected by JwtAuthGuard.
  app.setGlobalPrefix('api', {
    exclude: [{ path: 'Api/{*path}', method: RequestMethod.ALL }],
  });
  // Default helmet CSP blocks Vite inline bootstrap + Cloudflare beacon on production SPA.
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", 'https://static.cloudflareinsights.com'],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
          fontSrc: ["'self'", 'data:'],
          connectSrc: ["'self'", 'https:', 'wss:'],
          mediaSrc: ["'self'", 'blob:', 'https:'],
          frameSrc: ["'self'", 'https:'],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'self'"],
        },
      },
    }),
  );
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Permissions-Policy', 'camera=(self), geolocation=(self), microphone=()');
    next();
  });
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
      .setTitle('Noamany Fitness Center ERP API')
      .setDescription('Gym management system — members, subscriptions, POS, HR, accounting')
      .setVersion('1.0')
      .addBearerAuth()
      .addCookieAuth('access_token')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  // Serve uploaded files (employee photos, documents, signatures).
  const configuredUploadDir = config.get<string>('uploadDir') ?? './uploads';
  const uploadDir = isAbsolute(configuredUploadDir)
    ? configuredUploadDir
    : join(process.cwd(), configuredUploadDir);
  const publicUploadBase = config.get<string>('publicUploadBase') ?? '/uploads';
  for (const mount of sensitiveUploadMounts(publicUploadBase)) {
    app.use(mount, (_req: Request, response: Response) => response.status(404).end());
  }
  app.useStaticAssets(uploadDir, {
    prefix: publicUploadBase,
  });

  // Unified single-origin deployment:
  //   /              -> public website
  //   /login + all unknown application routes -> management system SPA
  //   /api + /uploads -> backend endpoints and uploaded assets
  const publicDir = join(process.cwd(), 'public');
  const siteIndexHtml = join(publicDir, 'index.html');
  const systemIndexHtml = join(publicDir, 'system.html');
  if (existsSync(siteIndexHtml)) {
    // Passenger may expose a mounted request's `path` as `/` while preserving
    // the browser URL in `originalUrl`. Handle the login shell before static
    // files so /login can never fall through to the public website index.
    if (existsSync(systemIndexHtml)) {
      app.use((req: Request, res: Response, next: NextFunction) => {
        if (req.method !== 'GET') return next();
        if (!req.headers.accept?.includes('text/html')) return next();
        const requestPath = req.originalUrl.split('?')[0];
        if (requestPath !== '/login' && !requestPath.startsWith('/login/')) return next();
        res.setHeader('Cache-Control', 'no-cache');
        return res.sendFile(systemIndexHtml);
      });
    }
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
      const requestPath = req.originalUrl.split('?')[0];
      if (requestPath.startsWith('/api') || requestPath.startsWith('/uploads')) return next();
      if (!req.headers.accept?.includes('text/html')) return next();
      // Public membership journeys use clean URLs; route them before the generic admin SPA fallback.
      if (requestPath.match(/^\/memberships\/\d+$/)) return res.sendFile(join(publicDir, 'membership.html'));
      if (requestPath === '/membership-checkout') return res.sendFile(join(publicDir, 'membership-checkout.html'));
      if (requestPath === '/') return res.sendFile(siteIndexHtml);
      return res.sendFile(existsSync(systemIndexHtml) ? systemIndexHtml : siteIndexHtml);
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
        '\n⚠️  No super-admin user found. Run `npm run db:seed:rbac` to synchronize roles ' +
          '(by users.level) before going live — otherwise all users are locked out.\n',
      );
    }
  } catch {
    // DB not reachable yet / table missing — skip the check rather than block boot.
  }

  const port = config.get<number>('port') ?? 4000;
  await app.listen(port);

  console.log(`Noamany HR API → http://localhost:${port}/api`);
}

bootstrap();
