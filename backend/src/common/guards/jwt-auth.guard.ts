import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { ROLES, type Role } from '../constants/roles';
import type { AuthenticatedRequest } from '../types/authenticated-request';
import { isObjectIdString } from '../utils/object-id';

export interface JwtPayload {
  sub: string;
  role: Role;
  iat?: number;
  exp?: number;
}

const BEARER_PREFIX = 'Bearer ';

function extractToken(request: Request): string | null {
  const header = request.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith(BEARER_PREFIX)) {
    return null;
  }
  const token = header.slice(BEARER_PREFIX.length);
  return token.length > 0 ? token : null;
}

// A valid signature does not guarantee the shape, so check it at runtime
function isJwtPayload(value: unknown): value is JwtPayload {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const { sub, role } = value as Record<string, unknown>;
  return isObjectIdString(sub) && typeof role === 'string' && ROLES.some((r) => r === role);
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractToken(request);
    if (!token) {
      throw new UnauthorizedException('Unauthorized');
    }

    let payload: unknown;
    try {
      // Pin the algorithm: protects against "alg: none" and algorithm-confusion tricks
      payload = await this.jwtService.verifyAsync<object>(token, { algorithms: ['HS256'] });
    } catch {
      // One generic message: never reveal why the token was rejected
      throw new UnauthorizedException('Unauthorized');
    }

    if (!isJwtPayload(payload)) {
      throw new UnauthorizedException('Unauthorized');
    }

    request.user = { userId: payload.sub, role: payload.role };
    return true;
  }
}
