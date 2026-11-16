// In @nestjs/throttler v6 the ttl is in MILLISECONDS
export const DEFAULT_THROTTLE_TTL_MS = 60_000;
export const DEFAULT_THROTTLE_LIMIT = 100;

// Stricter values for auth routes (register, login)
export const AUTH_THROTTLE_TTL_MS = 60_000;
export const AUTH_THROTTLE_LIMIT = 5;
