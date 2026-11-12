import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  it('accepts valid config and applies defaults', () => {
    const env = validateEnv({ MONGODB_URI: 'mongodb://localhost/test' });
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.CORS_ORIGIN).toBe('http://localhost:5173');
  });

  it('converts PORT from string', () => {
    const env = validateEnv({ MONGODB_URI: 'mongodb://x/y', PORT: '4000' });
    expect(env.PORT).toBe(4000);
  });

  it('throws when MONGODB_URI is missing', () => {
    expect(() => validateEnv({})).toThrow(/MONGODB_URI/);
  });

  it('throws on invalid NODE_ENV without leaking the URI', () => {
    const secret = 'mongodb+srv://user:topsecret@host/db';
    let message = '';
    try {
      validateEnv({ MONGODB_URI: secret, NODE_ENV: 'staging' });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/NODE_ENV/);
    expect(message).not.toContain('topsecret');
  });
});
