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
        const message = getErrorMessage({ MONGODB_URI: fakeUri, PORT: port });
        expect(message).toMatch(/PORT/);
        expect(message).not.toContain('secret-pass');
        expect(message).not.toContain(fakeUri);
      },
    );

    it('throws when MONGODB_URI is an empty string', () => {
      const message = getErrorMessage({ MONGODB_URI: '' });
      expect(message).toMatch(/MONGODB_URI/);
    });

    it('throws when CORS_ORIGIN is an empty string and does not leak the URI', () => {
      const message = getErrorMessage({ MONGODB_URI: fakeUri, CORS_ORIGIN: '' });
      expect(message).toMatch(/CORS_ORIGIN/);
      expect(message).not.toContain('secret-pass');
    });

    it.each(['development', 'production', 'test'])('accepts NODE_ENV %s', (nodeEnv) => {
      const env = validateEnv({ MONGODB_URI: fakeUri, NODE_ENV: nodeEnv });
      expect(env.NODE_ENV).toBe(nodeEnv);
    });

    it('rejects NODE_ENV staging and does not leak the URI', () => {
      const message = getErrorMessage({ MONGODB_URI: fakeUri, NODE_ENV: 'staging' });
      expect(message).toMatch(/NODE_ENV/);
      expect(message).not.toContain('secret-pass');
    });
  });
});
