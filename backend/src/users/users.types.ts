import type { Role } from '../common/constants/roles';

// No `role` here on purpose: users created through this path are always customers
export interface CreateUserData {
  email: string;
  name: string;
  passwordHash: string;
}

export interface FindByEmailOptions {
  withPassword?: boolean;
}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}
