// Error messages contain only the rule and the item number, never the origin value.
export class CorsOriginsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CorsOriginsError';
  }
}

// Parses CORS_ORIGIN: comma-separated list of origins (scheme + host [+ port]).
// Decisions:
// - A single trailing "/" is allowed and removed (URL.origin never has it).
// - Duplicates are compared after normalization, so case and trailing slash do not matter.
// - Whitespace around an item is trimmed (it is only a list separator style), but any
//   whitespace left inside an item is an error: URL silently strips tabs and newlines.
// - A host with a trailing dot ("a.com.") is an error, it is not normalized.
// - In production only https is allowed, except for the host "localhost".
// Throws CorsOriginsError on the first broken rule.
export function parseCorsOrigins(raw: string, nodeEnv: string): string[] {
  const items = raw.split(',').map((item) => item.trim());
  const result: string[] = [];

  items.forEach((item, index) => {
    const n = index + 1;
    if (item === '') {
      throw new CorsOriginsError(`item ${n} is empty`);
    }
    if (item === '*') {
      throw new CorsOriginsError(`item ${n}: wildcard "*" is not allowed`);
    }

    let url: URL;
    try {
      url = new URL(item);
    } catch {
      throw new CorsOriginsError(`item ${n} is not a valid URL`);
    }

    // The item is already trimmed here, so this only finds whitespace inside it
    if (/\s/.test(item)) {
      throw new CorsOriginsError(`item ${n} must not contain whitespace`);
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new CorsOriginsError(`item ${n}: only http and https are allowed`);
    }
    if (url.username !== '' || url.password !== '') {
      throw new CorsOriginsError(`item ${n} must not contain user info`);
    }
    // "?" and "#" are checked on the raw string: URL hides an empty query or hash
    if (/[?#]/.test(item) || url.pathname !== '/') {
      throw new CorsOriginsError(`item ${n} must not contain a path, query or hash`);
    }
    // "a.com." is a different string from the browser Origin header, so it would never match
    if (url.hostname.endsWith('.')) {
      throw new CorsOriginsError(`item ${n} must not have a trailing dot in the host`);
    }
    if (nodeEnv === 'production' && url.protocol !== 'https:' && url.hostname !== 'localhost') {
      throw new CorsOriginsError(`item ${n}: https is required in production`);
    }

    const origin = url.origin; // lowercased, without trailing slash
    if (result.includes(origin)) {
      throw new CorsOriginsError(`item ${n} is a duplicate`);
    }
    result.push(origin);
  });

  return result;
}
