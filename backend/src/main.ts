import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false, // multer handles multipart; we register JSON parser manually below
  });
  // Register JSON/urlencoded parsers explicitly (multer handles multipart separately)
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));
  const allowedOrigins = [
    'http://localhost:3000',
    'https://pie-three.vercel.app',
    ...(process.env.CORS_ORIGIN ? [process.env.CORS_ORIGIN] : []),
  ];
  app.enableCors({ origin: allowedOrigins });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
