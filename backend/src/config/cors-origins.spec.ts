import { CorsOriginsError, parseCorsOrigins } from './cors-origins';

// Unique marker: it must never appear in any error message (origins may hint at infrastructure).
const MARKER = 'marker-host.example.invalid';

function getError(raw: string, nodeEnv = 'development'): CorsOriginsError {
  try {
    parseCorsOrigins(raw, nodeEnv);
  } catch (e) {
    expect(e).toBeInstanceOf(CorsOriginsError);
    return e as CorsOriginsError;
  }
  throw new Error('Expected parseCorsOrigins to throw');
}

describe('parseCorsOrigins', () => {
  describe('valid input', () => {
    it('returns a single origin', () => {
      expect(parseCorsOrigins('http://localhost:5173', 'development')).toEqual([
        'http://localhost:5173',
      ]);
    });

    it('returns a comma-separated list in the same order', () => {
      expect(
        parseCorsOrigins(`https://a.example.invalid,https://b.example.invalid`, 'development'),
      ).toEqual(['https://a.example.invalid', 'https://b.example.invalid']);
    });

    it('trims spaces around items', () => {
      expect(
        parseCorsOrigins('  https://a.example.invalid  ,\thttps://b.example.invalid ', 'test'),
      ).toEqual(['https://a.example.invalid', 'https://b.example.invalid']);
    });

    it('removes a trailing slash', () => {
      expect(parseCorsOrigins('https://a.example.invalid/', 'development')).toEqual([
        'https://a.example.invalid',
      ]);
    });

    it('lowercases the host', () => {
      expect(parseCorsOrigins('https://A.Example.Invalid', 'development')).toEqual([
        'https://a.example.invalid',
      ]);
    });

    it('drops the default https port 443', () => {
      expect(parseCorsOrigins('https://a.example.invalid:443', 'development')).toEqual([
        'https://a.example.invalid',
      ]);
    });

    it('keeps a non-default port', () => {
      expect(parseCorsOrigins('https://a.example.invalid:8443', 'development')).toEqual([
        'https://a.example.invalid:8443',
      ]);
    });
  });

  describe('invalid input', () => {
    it('rejects an empty string', () => {
      expect(getError('').message).toMatch(/item 1 is empty/);
    });

    it('rejects an empty item in the middle (a,,b)', () => {
      const raw = `https://a.${MARKER},,https://b.${MARKER}`;
      const error = getError(raw);
      expect(error.message).toMatch(/item 2 is empty/);
      expect(error.message).not.toContain(MARKER);
    });

    it('rejects a trailing comma', () => {
      const error = getError(`https://a.${MARKER},`);
      expect(error.message).toMatch(/item 2 is empty/);
      expect(error.message).not.toContain(MARKER);
    });

    it('rejects a lone wildcard', () => {
      expect(getError('*').message).toMatch(/wildcard/);
    });

    it('rejects a wildcard inside a list and points to its item', () => {
      const error = getError(`https://a.${MARKER},*`);
      expect(error.message).toMatch(/item 2.*wildcard/);
      expect(error.message).not.toContain(MARKER);
    });

    it.each([
      ['the same origin twice', `https://${MARKER},https://${MARKER}`],
      ['different letter case', `https://${MARKER},https://${MARKER.toUpperCase()}`],
      ['with and without trailing slash', `https://${MARKER},https://${MARKER}/`],
      ['default port 443 spelled out', `https://${MARKER},https://${MARKER}:443`],
    ])('rejects a duplicate (%s)', (_name, raw) => {
      const error = getError(raw);
      expect(error.message).toMatch(/item 2 is a duplicate/);
      expect(error.message).not.toContain(MARKER);
      expect(error.message).not.toContain(MARKER.toUpperCase());
    });

    it.each([
      ['a path', `https://${MARKER}/api`],
      ['a query', `https://${MARKER}?a=1`],
      ['a hash', `https://${MARKER}#section`],
      ['an empty query', `https://${MARKER}?`],
      ['an empty hash', `https://${MARKER}#`],
      ['a trailing slash plus empty query', `https://${MARKER}/?`],
    ])('rejects an origin with %s', (_name, raw) => {
      const error = getError(raw);
      expect(error.message).toMatch(/path, query or hash/);
      expect(error.message).not.toContain(MARKER);
    });

    it.each([
      ['login only', `https://someone@${MARKER}`],
      ['login and password', `https://someone:placeholder@${MARKER}`],
    ])('rejects user info (%s)', (_name, raw) => {
      const error = getError(raw);
      expect(error.message).toMatch(/user info/);
      expect(error.message).not.toContain(MARKER);
      expect(error.message).not.toContain('someone');
      expect(error.message).not.toContain('placeholder');
    });

    it('rejects a scheme that is not http or https', () => {
      const error = getError(`ftp://${MARKER}`);
      expect(error.message).toMatch(/only http and https/);
      expect(error.message).not.toContain(MARKER);
    });

    it('rejects a value that is not a URL', () => {
      const error = getError(`not a url ${MARKER}`);
      expect(error.message).toMatch(/not a valid URL/);
      expect(error.message).not.toContain(MARKER);
    });

    it('rejects a host without a scheme', () => {
      const error = getError(MARKER);
      expect(error.message).toMatch(/not a valid URL/);
      expect(error.message).not.toContain(MARKER);
    });

    it.each([
      ['a trailing dot', `https://${MARKER}.`],
      ['a trailing dot with a port', `https://${MARKER}.:8443`],
    ])('rejects a host with %s', (_name, raw) => {
      const error = getError(raw);
      expect(error.message).toMatch(/trailing dot/);
      expect(error.message).not.toContain(MARKER);
    });

    it('rejects a tab inside an item (URL would silently glue the parts)', () => {
      const error = getError(`https://a.com\t.${MARKER}`);
      expect(error.message).toMatch(/must not contain whitespace/);
      expect(error.message).not.toContain(MARKER);
    });

    it('rejects a space inside the host (URL itself fails to parse it)', () => {
      const error = getError(`https://a. ${MARKER}`);
      expect(error.message).toMatch(/not a valid URL/);
      expect(error.message).not.toContain(MARKER);
    });

    it('rejects a backslash after the host (URL turns it into a path)', () => {
      // new URL('https://a.com\\@x') has hostname "a.com" and pathname "/@x", so the path rule fires
      const error = getError(`https://a.com\\@${MARKER}`);
      expect(error.message).toMatch(/path, query or hash/);
      expect(error.message).not.toContain(MARKER);
    });

    it('rejects the string "null" as not a URL', () => {
      expect(getError('null').message).toMatch(/not a valid URL/);
    });

    it('rejects the file: scheme', () => {
      const error = getError(`file:///${MARKER}`);
      expect(error.message).toMatch(/only http and https/);
      expect(error.message).not.toContain(MARKER);
    });
  });

  describe('special inputs', () => {
    it('converts a Cyrillic host to punycode', () => {
      expect(parseCorsOrigins('https://пример.рф', 'development')).toEqual([
        'https://xn--e1afmkfd.xn--p1ai',
      ]);
    });

    it('stays valid with outer spaces around the items', () => {
      expect(
        parseCorsOrigins(' https://a.example.invalid , https://b.example.invalid ', 'test'),
      ).toEqual(['https://a.example.invalid', 'https://b.example.invalid']);
    });
  });

  describe('production', () => {
    it('rejects http for a non-localhost host', () => {
      const error = getError(`http://${MARKER}`, 'production');
      expect(error.message).toMatch(/https is required in production/);
      expect(error.message).not.toContain(MARKER);
    });

    it('allows http for localhost', () => {
      expect(parseCorsOrigins('http://localhost:5173', 'production')).toEqual([
        'http://localhost:5173',
      ]);
    });

    it('allows https for a normal host', () => {
      expect(parseCorsOrigins('https://shop.example.com', 'production')).toEqual([
        'https://shop.example.com',
      ]);
    });
  });

  describe('development', () => {
    it('allows http for a non-localhost host', () => {
      expect(parseCorsOrigins(`http://${MARKER}`, 'development')).toEqual([`http://${MARKER}`]);
    });
  });
});
