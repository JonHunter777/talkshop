import * as bcrypt from 'bcryptjs';
import { BCRYPT_ROUNDS, DUMMY_HASH } from './auth';

describe('auth constants', () => {
  // DUMMY_HASH is compared when the email is unknown. If its cost differs from the real hashes,
  // the response time reveals which emails exist, so the two values must stay in sync.
  it('DUMMY_HASH has the same cost as BCRYPT_ROUNDS', () => {
    expect(bcrypt.getRounds(DUMMY_HASH)).toBe(BCRYPT_ROUNDS);
  });
});
