import { NestFactory } from '@nestjs/core';
import { VersioningType } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';

import helmet from 'helmet';

import { AppModule } from './app.module';
import { serveUploads } from './common/files/uploads';
import { env } from './core/config/env.config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });
  app.enableShutdownHooks();

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // CCTV captures and store photos
  serveUploads(app);

  app.enableCors({
    origin: env.CORS_ALLOWED_ORIGINS.includes('*') ? true : env.CORS_ALLOWED_ORIGINS,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  await app.listen(env.PORT, '0.0.0.0');
}
bootstrap();