import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

// Docs are served at /api/docs (JSON: /api/docs-json).
// The path is written in full because setup() ignores the global prefix by default.
export function setupSwagger(app: INestApplication, enabled: boolean): void {
  if (!enabled) return;

  const options = new DocumentBuilder()
    .setTitle('Talkshop API')
    .setDescription('REST API of the AI-powered online shop')
    .setVersion('1.0')
    .addBearerAuth() // for the future JWT auth
    .build();

  const document = SwaggerModule.createDocument(app, options);
  SwaggerModule.setup('api/docs', app, document);
}
