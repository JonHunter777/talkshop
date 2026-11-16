import type { Role } from '../constants/roles';

// The user taken from a verified JWT; never build it from body or query
export interface AuthUser {
  userId: string;
  role: Role;
}
