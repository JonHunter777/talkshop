import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiUnauthorizedResponse } from '@nestjs/swagger';
import type { Role } from '../constants/roles';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from './roles.decorator';

// Protects a route: valid JWT, and (optionally) one of the given roles.
// Guard order matters: JwtAuthGuard sets request.user, then RolesGuard reads it.
export function Auth(...roles: Role[]) {
  const decorators = [
    UseGuards(JwtAuthGuard, RolesGuard),
    ApiBearerAuth(),
    ApiUnauthorizedResponse({ description: 'Missing or invalid access token' }),
  ];
  if (roles.length > 0) {
    decorators.push(
      Roles(...roles),
      ApiForbiddenResponse({ description: `Requires role: ${roles.join(', ')}` }),
    );
  }
  return applyDecorators(...decorators);
}
