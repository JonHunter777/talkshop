import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthErrorDto, HealthOkDto } from './dto/health-response.dto';
import { HealthService } from './health.service';

export interface HealthResponse {
  status: 'ok' | 'error';
  db: 'up' | 'down';
}

// Platform probes (Render/Railway) poll often, so no rate limit here
@SkipThrottle()
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Check that the API and the database are alive' })
  @ApiOkResponse({ description: 'API and DB are up', type: HealthOkDto })
  @ApiServiceUnavailableResponse({
    description: 'Database is unreachable',
    type: HealthErrorDto,
  })
  async check(): Promise<HealthResponse> {
    if (await this.healthService.isDbUp()) {
      return { status: 'ok', db: 'up' };
    }
    const body: HealthResponse = { status: 'error', db: 'down' };
    throw new ServiceUnavailableException(body);
  }
}
