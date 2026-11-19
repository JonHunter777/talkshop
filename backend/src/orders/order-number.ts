import { randomInt } from 'node:crypto';

// Injection token: the service gets the generator as a dependency, so a test can replace it
// (e.g. to simulate a duplicate number).
export const ORDER_NUMBER_GENERATOR = Symbol('ORDER_NUMBER_GENERATOR');
export type OrderNumberGenerator = () => string;

// 32 characters without the easily confused ones (0/O, 1/I)
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SUFFIX_LENGTH = 6;

// Format: TS-YYMMDD-XXXXXX (date in UTC). The suffix comes from a cryptographic generator,
// so numbers cannot be guessed; uniqueness is guaranteed by the unique index, not by this function.
export const ORDER_NUMBER_REGEX = /^TS-\d{6}-[A-HJ-NP-Z2-9]{6}$/;

export function generateOrderNumber(now: Date = new Date()): string {
  const yy = String(now.getUTCFullYear()).slice(-2);
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const suffix = Array.from({ length: SUFFIX_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]);
  return `TS-${yy}${mm}${dd}-${suffix.join('')}`;
}
