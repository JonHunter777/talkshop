import { validateEnv } from './env.validation';

const JWT_SECRET = 'test-jwt-secret-with-at-least-32-characters!';

describe('validateEnv', () => {
  it('accepts valid config and applies defaults', () => {
    const env = validateEnv({ MONGODB_URI: 'mongodb://localhost/test', JWT_SECRET });
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.CORS_ORIGIN).toBe('http://localhost:5173');
  });

  it('converts PORT from string', () => {
    const env = validateEnv({ MONGODB_URI: 'mongodb://x/y', JWT_SECRET, PORT: '4000' });
    expect(env.PORT).toBe(4000);
  });

  it('throws when MONGODB_URI is missing', () => {
    expect(() => validateEnv({ JWT_SECRET })).toThrow(/MONGODB_URI/);
  });

  it('throws on invalid NODE_ENV without leaking the URI', () => {
    const secret = 'mongodb+srv://user:topsecret@host/db';
    let message = '';
    try {
      validateEnv({ MONGODB_URI: secret, JWT_SECRET, NODE_ENV: 'staging' });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/NODE_ENV/);
    expect(message).not.toContain('topsecret');
  });

  describe('edge cases', () => {
    const fakeUri = 'mongodb://user:secret-pass@host/db';

    function getErrorMessage(config: Record<string, unknown>): string {
      try {
        validateEnv(config);
      } catch (e) {
        return (e as Error).message;
      }
      return '';
    }

    it.each(['abc', '0', '70000', '-1', '3000.5'])(
      'rejects invalid PORT %s and does not leak the URI',
      (port) => {
        const message = getErrorMessage({ MONGODB_URI: fakeUri, JWT_SECRET, PORT: port });
        expect(message).toMatch(/PORT/);
        expect(message).not.toContain('secret-pass');
        expect(message).not.toContain(fakeUri);
      },
    );

    it('throws when MONGODB_URI is an empty string', () => {
      const message = getErrorMessage({ MONGODB_URI: '', JWT_SECRET });
      expect(message).toMatch(/MONGODB_URI/);
    });

    it('throws when CORS_ORIGIN is an empty string and does not leak the URI', () => {
      const message = getErrorMessage({ MONGODB_URI: fakeUri, JWT_SECRET, CORS_ORIGIN: '' });
      expect(message).toMatch(/CORS_ORIGIN/);
      expect(message).not.toContain('secret-pass');
    });

    it('throws when JWT_SECRET is missing', () => {
      expect(getErrorMessage({ MONGODB_URI: fakeUri })).toMatch(/JWT_SECRET/);
    });

    it('throws when JWT_SECRET is shorter than 32 chars and does not leak it', () => {
      const shortSecret = 'short-secret-value-31-chars-xxx';
      expect(shortSecret.length).toBe(31);
      const message = getErrorMessage({ MONGODB_URI: fakeUri, JWT_SECRET: shortSecret });
      expect(message).toMatch(/JWT_SECRET/);
      expect(message).not.toContain(shortSecret);
      expect(message).not.toContain('secret-pass');
    });

    it('accepts JWT_SECRET of exactly 32 chars', () => {
      const env = validateEnv({ MONGODB_URI: fakeUri, JWT_SECRET: 'a'.repeat(32) });
      expect(env.JWT_SECRET).toHaveLength(32);
    });

    it('uses default JWT_EXPIRES_IN_SECONDS of 3600', () => {
      const env = validateEnv({ MONGODB_URI: fakeUri, JWT_SECRET });
      expect(env.JWT_EXPIRES_IN_SECONDS).toBe(3600);
    });

    it('converts JWT_EXPIRES_IN_SECONDS from string', () => {
      const env = validateEnv({
        MONGODB_URI: fakeUri,
        JWT_SECRET,
        JWT_EXPIRES_IN_SECONDS: '7200',
      });
      expect(env.JWT_EXPIRES_IN_SECONDS).toBe(7200);
    });

    it.each(['59', '604801', '0', '-5', 'abc', '60.5'])(
      'rejects JWT_EXPIRES_IN_SECONDS %s and does not leak secrets',
      (ttl) => {
        const message = getErrorMessage({
          MONGODB_URI: fakeUri,
          JWT_SECRET,
          JWT_EXPIRES_IN_SECONDS: ttl,
        });
        expect(message).toMatch(/JWT_EXPIRES_IN_SECONDS/);
        expect(message).not.toContain(JWT_SECRET);
        expect(message).not.toContain('secret-pass');
      },
    );

    it.each(['development', 'production', 'test'])('accepts NODE_ENV %s', (nodeEnv) => {
      const env = validateEnv({ MONGODB_URI: fakeUri, JWT_SECRET, NODE_ENV: nodeEnv });
      expect(env.NODE_ENV).toBe(nodeEnv);
    });

    it('rejects NODE_ENV staging and does not leak the URI', () => {
      const message = getErrorMessage({ MONGODB_URI: fakeUri, JWT_SECRET, NODE_ENV: 'staging' });
      expect(message).toMatch(/NODE_ENV/);
      expect(message).not.toContain('secret-pass');
    });
  });
});
