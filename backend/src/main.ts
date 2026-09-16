import { NestFactory } from '@nestjs/core';
import { existsSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
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

  const allowedOrigins = [...DEFAULT_ALLOWED_ORIGINS, ...extraOrigins];

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
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