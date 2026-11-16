import type { Request } from 'express';
import type { AuthUser } from './auth-user';

// Request after JwtAuthGuard: `user` is filled from the verified token
export type AuthenticatedRequest = Request & { user: AuthUser };
