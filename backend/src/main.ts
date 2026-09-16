import { NestFactory } from '@nestjs/core';
import { existsSync } from 'node:fs';
import path from 'node:path';
import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { AppModule } from './app.module.js';

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const extraOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  const allowedOrigins = new Set<string>([
    ...DEFAULT_ALLOWED_ORIGINS,
    ...extraOrigins,
  ]);

  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    const host = req.headers.host;
    const isSameOrigin =
      typeof origin === 'string' &&
      typeof host === 'string' &&
      origin.endsWith(`://${host}`);

    if (origin && (isSameOrigin || allowedOrigins.has(origin))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader(
        'Access-Control-Allow-Methods',
        'GET,HEAD,POST,OPTIONS,DELETE,PUT,PATCH',
      );
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, x-signature, x-request-id',
      );

      if (req.method === 'OPTIONS') {
        res.sendStatus(204);
        return;
      }
    }

    next();
  });

  const frontendOutDir = path.resolve(process.cwd(), 'public');
  if (existsSync(frontendOutDir)) {
    const staticHandler = express.static(frontendOutDir, {
      index: 'index.html',
    });
    app.use(staticHandler);
    app.use(
      (
        req: express.Request,
        res: express.Response,
        next: express.NextFunction,
      ) => {
        const isStaticAsset =
          req.path.startsWith('/_next/') ||
          req.path.startsWith('/favicon.ico');
        if (
          req.method === 'GET' &&
          !req.path.startsWith('/api/') &&
          !isStaticAsset
        ) {
          res.sendFile(path.join(frontendOutDir, 'index.html'));
          return;
        }
        next();
      },
    );
  }

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();