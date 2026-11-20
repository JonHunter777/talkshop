import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { setupSwagger } from './swagger.setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  configureApp(app);
  setupSwagger(app, config.getOrThrow<string>('NODE_ENV') !== 'production');

  await app.listen(config.getOrThrow<number>('PORT'));
}
void bootstrap();
