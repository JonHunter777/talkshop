import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthUser } from '../types/auth-user';
import type { AuthenticatedRequest } from '../types/authenticated-request';

// Use only on routes protected by JwtAuthGuard (see @Auth), otherwise `user` is not set
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user;
  },
);
