export const ROLES = ['customer', 'admin'] as const;

export type Role = (typeof ROLES)[number];
