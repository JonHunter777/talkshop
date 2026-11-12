import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { HealthService } from './health.service';

export interface HealthResponse {
  status: 'ok' | 'error';
  db: 'up' | 'down';
}

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  async check(): Promise<HealthResponse> {
    if (await this.healthService.isDbUp()) {
      return { status: 'ok', db: 'up' };
    }
    const body: HealthResponse = { status: 'error', db: 'down' };
    throw new ServiceUnavailableException(body);
  }
}
