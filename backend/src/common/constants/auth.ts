// Cost 10: ~100 ms per hash, a common balance between security and login speed
export const BCRYPT_ROUNDS = 10;

// Valid bcrypt hash of a random string. Used to compare against when the email is unknown,
// so the response time is the same and does not reveal which emails exist.
// Its cost is baked into the string: when BCRYPT_ROUNDS changes, generate a new hash
// (common/constants/auth.spec.ts fails if the two get out of sync).
export const DUMMY_HASH = '$2b$10$CY.xIkSQky7m1H3BWB4GQujOiQOZZ0D3xkPvW1.JT8fRWeq7VU1hC';
