import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  // Se desactiva el body parser por defecto (límite de 100 kb) para configurar
  // un límite mayor: los comprobantes de pago se suben como imagen en base64.
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(json({ limit: '12mb' }));
  app.use(urlencoded({ extended: true, limit: '12mb' }));
  const config = app.get(ConfigService);

  // Prefijo global para todas las rutas: /api/...
  app.setGlobalPrefix('api');

  // Validación automática de los DTO entrantes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS para permitir las peticiones del frontend Next.js.
  // Admite varios orígenes separados por comas (p. ej. dev en 3000 y 3002).
  const corsOrigins = config
    .get<string>('CORS_ORIGIN', 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  const port = config.get<number>('PORT', 3001);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`🥩 API Carnes Santacruz escuchando en http://localhost:${port}/api`);
}
bootstrap();
