import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UsersService } from '../../users/users.service';
import type { Role } from '../constants/roles';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { AuthenticatedRequest } from '../types/authenticated-request';

// Must run after JwtAuthGuard, which sets request.user.
//
// Routes with @Roles(...) (the admin routes) do NOT trust the role from the token alone:
// a JWT lives up to an hour, so a demoted or deleted admin would keep working until it expires.
// These routes read the current role from the database (one read by _id; admin traffic is low).
// Routes without @Roles (cart, own orders, ...) keep using the token only: no extra DB read.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    // Cheap check first: a token that does not even claim the role is rejected without a DB read.
    // (A user promoted after the token was issued has to log in again: that is the safe direction.)
    if (!request.user || !required.includes(request.user.role)) {
      throw new ForbiddenException('Forbidden resource');
    }

    // The token claims the role: confirm it. A database error is not caught here on purpose:
    // the request fails (500) instead of letting an unverified admin through.
    const currentRole = await this.usersService.findRoleById(request.user.userId);
    if (!currentRole) {
      // The user was deleted: the token is no longer valid (same generic text as JwtAuthGuard)
      throw new UnauthorizedException('Unauthorized');
    }
    if (!required.includes(currentRole)) {
      throw new ForbiddenException('Forbidden resource');
    }
    // Code after the guard sees the role from the database, not from the token
    request.user.role = currentRole;
    return true;
  }
}
