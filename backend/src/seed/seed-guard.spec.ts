import mongoose from 'mongoose';
import {
  assertSafeDbTarget,
  assertSafeSeedTarget,
  parseMongoTarget,
  parseSeedEnv,
  SeedGuardError,
} from './seed-guard';

// Unique strings: if one of them shows up in an error message, a secret has leaked.
const ADMIN_EMAIL_MARKER = 'leakadmin.marker@leak-host.example.invalid';
const USER_EMAIL_MARKER = 'leakuser.marker@leak-host.example.invalid';
const ADMIN_PASSWORD_MARKER = 'AdminPwdLeakMarker#41';
const USER_PASSWORD_MARKER = 'UserPwdLeakMarker#42';
const CLUSTER_HOST_MARKER = 'cluster-leak-marker.example.invalid';
const URI_LOGIN_MARKER = 'uriLoginLeakMarker';
const URI_PASSWORD_MARKER = 'uriPasswordLeakMarker';

const ALL_MARKERS = [
  ADMIN_EMAIL_MARKER,
  USER_EMAIL_MARKER,
  ADMIN_PASSWORD_MARKER,
  USER_PASSWORD_MARKER,
  CLUSTER_HOST_MARKER,
  URI_LOGIN_MARKER,
  URI_PASSWORD_MARKER,
];

// A URI with credentials is assembled at runtime from parts, so the file text has no "login:password@" literal.
const SRV_SCHEME = 'mongodb+srv://';
function uriWithCredentials(dbPath: string, password = URI_PASSWORD_MARKER): string {
  return `${SRV_SCHEME}${URI_LOGIN_MARKER}:${password}@${CLUSTER_HOST_MARKER}${dbPath}`;
}

const INVALID_URI_MESSAGE = 'MONGODB_URI: must be a mongodb:// or mongodb+srv:// connection string';
const E2E_NAME = 'e2e_0123456789ab';

function getError(action: () => unknown): Error {
  try {
    action();
  } catch (error) {
    return error as Error;
  }
  throw new Error('Expected the function to throw, but it did not');
}

// Checks the exact message, the error class and its name, and that no marker secret leaked.
function expectRefusal(action: () => unknown, message: string): void {
  const error = getError(action);
  expect(error).toBeInstanceOf(SeedGuardError);
  expect(error.name).toBe('SeedGuardError');
  expect(error.message).toBe(message);
  for (const marker of ALL_MARKERS) {
    expect(error.message).not.toContain(marker);
  }
}

const validSeedEnv = (): Record<string, string> => ({
  SEED_ADMIN_EMAIL: ADMIN_EMAIL_MARKER,
  SEED_ADMIN_PASSWORD: ADMIN_PASSWORD_MARKER,
  SEED_USER_EMAIL: USER_EMAIL_MARKER,
  SEED_USER_PASSWORD: USER_PASSWORD_MARKER,
});

describe('parseMongoTarget', () => {
  it('parses a single host with port and database', () => {
    expect(parseMongoTarget('mongodb://127.0.0.1:27017/talkshop-dev')).toEqual({
      dbName: 'talkshop-dev',
      hosts: ['127.0.0.1'],
    });
  });

  it('parses several hosts and cuts the port of each one', () => {
    expect(parseMongoTarget('mongodb://h1.example.invalid:27017,h2.example.invalid/db1')).toEqual({
      dbName: 'db1',
      hosts: ['h1.example.invalid', 'h2.example.invalid'],
    });
  });

  it('parses a mongodb+srv URI and ignores the query', () => {
    expect(
      parseMongoTarget('mongodb+srv://cluster0.example.invalid/talkshop-dev?retryWrites=true'),
    ).toEqual({ dbName: 'talkshop-dev', hosts: ['cluster0.example.invalid'] });
  });

  it('returns an empty database name when the URI has a query but no path', () => {
    expect(parseMongoTarget('mongodb://localhost?replicaSet=rs0')).toEqual({
      dbName: '',
      hosts: ['localhost'],
    });
  });

  it.each(['mongodb://localhost', 'mongodb://localhost/', 'mongodb://localhost/?replicaSet=rs0'])(
    'returns an empty database name for %s',
    (uri) => {
      expect(parseMongoTarget(uri).dbName).toBe('');
    },
  );

  it('keeps IPv6 hosts in brackets and cuts the port', () => {
    expect(parseMongoTarget('mongodb://[::1]:27017/talkshop-dev')).toEqual({
      dbName: 'talkshop-dev',
      hosts: ['[::1]'],
    });
  });

  it('drops credentials: only the host list is returned', () => {
    const target = parseMongoTarget(uriWithCredentials('/talkshop-dev'));
    expect(target).toEqual({ dbName: 'talkshop-dev', hosts: [CLUSTER_HOST_MARKER] });
  });

  it.each(['http://127.0.0.1/talkshop-dev', 'mongodb:/127.0.0.1/db', 'localhost/db', ''])(
    'throws for the invalid scheme in %p',
    (uri) => {
      expectRefusal(() => parseMongoTarget(uri), INVALID_URI_MESSAGE);
    },
  );

  it('throws when the host list is empty', () => {
    expectRefusal(() => parseMongoTarget('mongodb:///talkshop-dev'), INVALID_URI_MESSAGE);
  });

  it('throws when one of the hosts is empty', () => {
    expectRefusal(() => parseMongoTarget('mongodb://localhost,/db'), INVALID_URI_MESSAGE);
  });

  it('throws for an IPv6 host without a closing bracket', () => {
    expectRefusal(() => parseMongoTarget('mongodb://[::1/db'), INVALID_URI_MESSAGE);
  });
});

describe('assertSafeDbTarget', () => {
  it.each([
    'mongodb://127.0.0.1:27017/talkshop-dev',
    'mongodb+srv://cluster0.example.invalid/talkshop-dev',
    'mongodb://a.example.invalid,b.example.invalid/talkshop-dev?replicaSet=rs0',
    'mongodb://[::1]:27017/talkshop-dev',
  ])('allows talkshop-dev on any host: %s', (uri) => {
    expect(() => assertSafeDbTarget(uri)).not.toThrow();
  });

  it.each([`mongodb://127.0.0.1:27017/${E2E_NAME}`, `mongodb://localhost/${E2E_NAME}`])(
    'allows an e2e database on a local host: %s',
    (uri) => {
      expect(() => assertSafeDbTarget(uri)).not.toThrow();
    },
  );

  it('allows an e2e database with several local hosts', () => {
    expect(() =>
      assertSafeDbTarget(`mongodb://127.0.0.1,localhost:27018/${E2E_NAME}`),
    ).not.toThrow();
  });

  it.each([
    'mongodb+srv://cluster0.example.invalid/' + E2E_NAME,
    `mongodb://[::1]:27017/${E2E_NAME}`,
    `mongodb://127.0.0.1,other.example.invalid/${E2E_NAME}`,
  ])('refuses an e2e database on a non-local host: %s', (uri) => {
    expectRefusal(
      () => assertSafeDbTarget(uri),
      `Refusing to seed database "${E2E_NAME}": e2e databases are allowed only on 127.0.0.1 or localhost`,
    );
  });

  it.each(['shop-dev', 'talkshop-prod-test', 'talkshop-dev2', 'Talkshop-Dev', 'test', 'e2e_XYZ'])(
    'refuses the database "%s"',
    (name) => {
      expectRefusal(
        () => assertSafeDbTarget(`mongodb://127.0.0.1/${name}`),
        `Refusing to seed database "${name}": allowed are exactly "talkshop-dev" or /^e2e_[0-9a-f]{12}$/ on a local host`,
      );
    },
  );

  it('refuses an e2e name with 13 hex characters', () => {
    expectRefusal(
      () => assertSafeDbTarget('mongodb://127.0.0.1/e2e_0123456789abc'),
      'Refusing to seed database "e2e_0123456789abc": allowed are exactly "talkshop-dev" or /^e2e_[0-9a-f]{12}$/ on a local host',
    );
  });

  it('refuses a name with a trailing space and does not print it', () => {
    expectRefusal(
      () => assertSafeDbTarget('mongodb://127.0.0.1/talkshop-dev '),
      'Refusing to seed the target database: allowed are exactly "talkshop-dev" or /^e2e_[0-9a-f]{12}$/ on a local host',
    );
  });

  it.each(['mongodb://127.0.0.1', 'mongodb://127.0.0.1/', 'mongodb://127.0.0.1/?retryWrites=true'])(
    'refuses a URI without a database name: %s',
    (uri) => {
      expectRefusal(
        () => assertSafeDbTarget(uri),
        'Refusing to seed: no database name in MONGODB_URI (allowed: "talkshop-dev")',
      );
    },
  );

  it('does not leak credentials or the cluster host when the database is refused', () => {
    expectRefusal(
      () => assertSafeDbTarget(uriWithCredentials('/shop-dev')),
      'Refusing to seed database "shop-dev": allowed are exactly "talkshop-dev" or /^e2e_[0-9a-f]{12}$/ on a local host',
    );
  });

  it('does not leak credentials when an e2e database is on a foreign host', () => {
    expectRefusal(
      () => assertSafeDbTarget(uriWithCredentials(`/${E2E_NAME}`)),
      `Refusing to seed database "${E2E_NAME}": e2e databases are allowed only on 127.0.0.1 or localhost`,
    );
  });

  it('does not print a piece of a password when it breaks the URI structure', () => {
    // An unescaped "/" in the password: the "database name" becomes a piece of the secret
    expectRefusal(
      () => assertSafeDbTarget(uriWithCredentials('', `part1/${URI_PASSWORD_MARKER}`)),
      'Refusing to seed the target database: allowed are exactly "talkshop-dev" or /^e2e_[0-9a-f]{12}$/ on a local host',
    );
  });

  it('throws SeedGuardError for an invalid scheme', () => {
    expectRefusal(
      () => assertSafeDbTarget('postgres://127.0.0.1/talkshop-dev'),
      INVALID_URI_MESSAGE,
    );
  });
});

// ---------------------------------------------------------------------------------------
// Contract test: the guard against the REAL driver parser.
// The danger is a URI that the guard reads as "talkshop-dev", while the driver connects to
// another database. `new MongoClient(uri)` only parses the string: there is no connect()
// call, so no network and no database are touched.
// ---------------------------------------------------------------------------------------
const PARSE_ERROR = 'MongoParseError';
const NO_DB_MESSAGE = 'Refusing to seed: no database name in MONGODB_URI (allowed: "talkshop-dev")';
const HIDDEN_DB_MESSAGE =
  'Refusing to seed the target database: allowed are exactly "talkshop-dev" or /^e2e_[0-9a-f]{12}$/ on a local host';

// Credentials are assembled at runtime: the file has no "login:password@" literal.
const CONTRACT_LOGIN = 'contractLogin';
const AT = '@';
function withUserInfo(userInfo: string, hostAndPath: string): string {
  return `mongodb://${userInfo}${AT}${hostAndPath}`;
}

// What the driver chose: a database name, or PARSE_ERROR when the driver refuses the string.
function driverChoice(uri: string): string {
  try {
    return new mongoose.mongo.MongoClient(uri).options.dbName;
  } catch (error) {
    if (error instanceof Error && error.name === PARSE_ERROR) {
      return PARSE_ERROR;
    }
    throw error;
  }
}

interface ContractCase {
  name: string;
  uri: string;
  // approved: assertSafeDbTarget does not throw; rejected: it throws SeedGuardError(message)
  verdict: 'approved' | 'rejected';
  message?: string;
}

const contractCases: ContractCase[] = [
  { name: 'plain host', uri: 'mongodb://h/talkshop-dev', verdict: 'approved' },
  {
    name: 'srv host',
    uri: 'mongodb+srv://cluster0.example.invalid/talkshop-dev',
    verdict: 'approved',
  },
  {
    name: 'several hosts with ports',
    uri: 'mongodb://a.example.invalid:27017,b.example.invalid:27018/talkshop-dev',
    verdict: 'approved',
  },
  {
    name: '"?" in the password before the path',
    uri: withUserInfo(`${CONTRACT_LOGIN}:pa?ss`, 'h/talkshop-dev'),
    verdict: 'rejected',
    message: NO_DB_MESSAGE,
  },
  {
    name: '"/" in the password',
    uri: withUserInfo(`${CONTRACT_LOGIN}:pa/ss`, 'h/talkshop-dev'),
    verdict: 'rejected',
    message: HIDDEN_DB_MESSAGE,
  },
  {
    name: 'two "@" in the user info',
    uri: withUserInfo(`${CONTRACT_LOGIN}:pa${AT}ss`, 'h/talkshop-dev'),
    verdict: 'approved',
  },
  {
    // The guard cuts the path at "?", the driver refuses the whole string
    name: 'a "/" inside the query',
    uri: 'mongodb://h/talkshop-dev?x=/other',
    verdict: 'approved',
  },
  {
    name: 'extra path segment',
    uri: 'mongodb://h/talkshop-dev/extra',
    verdict: 'rejected',
    message: HIDDEN_DB_MESSAGE,
  },
  {
    // The driver takes dbName from the query when the path is empty: that is "prod"
    name: '?dbName=prod without a path',
    uri: 'mongodb://h/?dbName=prod',
    verdict: 'rejected',
    message: NO_DB_MESSAGE,
  },
  {
    name: '?dbName=prod without a slash',
    uri: 'mongodb://h?dbName=prod',
    verdict: 'rejected',
    message: NO_DB_MESSAGE,
  },
  {
    name: '?dbName=prod together with the path',
    uri: 'mongodb://h/talkshop-dev?dbName=prod',
    verdict: 'approved',
  },
  {
    name: 'percent-encoded dash in the name',
    uri: 'mongodb://h/talkshop%2Ddev',
    verdict: 'rejected',
    message: HIDDEN_DB_MESSAGE,
  },
  {
    name: '#fragment after the name',
    uri: 'mongodb://h/talkshop-dev#fragment',
    verdict: 'rejected',
    message: HIDDEN_DB_MESSAGE,
  },
  {
    name: 'uppercase scheme',
    uri: 'MONGODB://h/talkshop-dev',
    verdict: 'rejected',
    message: INVALID_URI_MESSAGE,
  },
  {
    name: 'leading space',
    uri: ' mongodb://h/talkshop-dev',
    verdict: 'rejected',
    message: INVALID_URI_MESSAGE,
  },
  { name: 'local e2e database', uri: `mongodb://127.0.0.1/${E2E_NAME}`, verdict: 'approved' },
];

describe('assertSafeDbTarget against the MongoDB driver parser (contract)', () => {
  it.each(contractCases)('$name: the guard verdict is as expected', ({ uri, verdict, message }) => {
    if (verdict === 'approved') {
      expect(() => assertSafeDbTarget(uri)).not.toThrow();
    } else {
      expectRefusal(() => assertSafeDbTarget(uri), message ?? '');
    }
  });

  // The invariant: never "the guard approved, but the driver picked another database".
  // Allowed combinations: guard refuses, OR the driver refuses to parse, OR the names are equal.
  it.each(contractCases)(
    '$name: an approved URI never leads the driver to another database',
    ({ uri }) => {
      let approvedName: string | undefined;
      try {
        assertSafeDbTarget(uri);
        approvedName = parseMongoTarget(uri).dbName;
      } catch (error) {
        expect(error).toBeInstanceOf(SeedGuardError);
      }
      if (approvedName === undefined) {
        return; // refused by the guard: nothing more to check
      }

      const chosen = driverChoice(uri);

      if (chosen !== PARSE_ERROR) {
        expect(chosen).toBe(approvedName);
      }
      expect([approvedName, PARSE_ERROR]).toContain(chosen);
    },
  );

  it('documents why ?dbName= without a path is refused: the driver would pick that database', () => {
    expect(driverChoice('mongodb://h/?dbName=prod')).toBe('prod');
    expect(() => assertSafeDbTarget('mongodb://h/?dbName=prod')).toThrow(SeedGuardError);
  });

  it('keeps the path name when ?dbName= is given together with the path', () => {
    expect(driverChoice('mongodb://h/talkshop-dev?dbName=prod')).toBe('talkshop-dev');
  });

  it('does not print any part of the password when "?" or "/" breaks the URI', () => {
    for (const secret of ['pa?ssSecretPiece', 'pa/ssSecretPiece']) {
      const error = getError(() =>
        assertSafeDbTarget(withUserInfo(`${CONTRACT_LOGIN}:${secret}`, 'h/talkshop-dev')),
      );
      expect(error.message).not.toContain('SecretPiece');
      expect(error.message).not.toContain(CONTRACT_LOGIN);
    }
  });
});

describe('parseSeedEnv', () => {
  it('returns the accounts for valid variables', () => {
    expect(parseSeedEnv(validSeedEnv())).toEqual({
      admin: { email: ADMIN_EMAIL_MARKER, password: ADMIN_PASSWORD_MARKER },
      user: { email: USER_EMAIL_MARKER, password: USER_PASSWORD_MARKER },
    });
  });

  it.each(['SEED_ADMIN_EMAIL', 'SEED_ADMIN_PASSWORD', 'SEED_USER_EMAIL', 'SEED_USER_PASSWORD'])(
    'refuses when %s is missing',
    (name) => {
      const env = validSeedEnv();
      delete env[name];
      expectRefusal(() => parseSeedEnv(env), `${name}: must be set`);
    },
  );

  it.each(['SEED_ADMIN_EMAIL', 'SEED_ADMIN_PASSWORD', 'SEED_USER_EMAIL', 'SEED_USER_PASSWORD'])(
    'refuses when %s is empty',
    (name) => {
      expectRefusal(() => parseSeedEnv({ ...validSeedEnv(), [name]: '' }), `${name}: must be set`);
    },
  );

  it('refuses a value that contains only spaces', () => {
    expectRefusal(
      () => parseSeedEnv({ ...validSeedEnv(), SEED_USER_PASSWORD: '        ' }),
      'SEED_USER_PASSWORD: must be set',
    );
  });

  it.each(['SEED_ADMIN_EMAIL', 'SEED_ADMIN_PASSWORD', 'SEED_USER_EMAIL', 'SEED_USER_PASSWORD'])(
    'refuses a placeholder in %s',
    (name) => {
      expectRefusal(
        () => parseSeedEnv({ ...validSeedEnv(), [name]: '<copied-from-example>' }),
        `${name}: still contains a placeholder, set a real value`,
      );
    },
  );

  it('refuses an invalid email without printing it', () => {
    expectRefusal(
      () =>
        parseSeedEnv({
          ...validSeedEnv(),
          SEED_ADMIN_EMAIL: `${ADMIN_EMAIL_MARKER}@second-at-sign`,
        }),
      'SEED_ADMIN_EMAIL: must be a valid email up to 254 characters',
    );
  });

  it('refuses an email longer than 254 characters', () => {
    const longEmail = `${'a'.repeat(60)}@${'b'.repeat(60)}.${'c'.repeat(60)}.${'d'.repeat(60)}.${'e'.repeat(60)}.com`;
    expect(longEmail.length).toBeGreaterThan(254);
    expectRefusal(
      () => parseSeedEnv({ ...validSeedEnv(), SEED_USER_EMAIL: longEmail }),
      'SEED_USER_EMAIL: must be a valid email up to 254 characters',
    );
  });

  it('normalizes emails: trims spaces and lowercases', () => {
    const config = parseSeedEnv({
      ...validSeedEnv(),
      SEED_ADMIN_EMAIL: '  Admin.Mixed@Case-Host.Example.Invalid  ',
      SEED_USER_EMAIL: 'USER.UPPER@CASE-HOST.EXAMPLE.INVALID',
    });
    expect(config.admin.email).toBe('admin.mixed@case-host.example.invalid');
    expect(config.user.email).toBe('user.upper@case-host.example.invalid');
  });

  it('refuses identical emails after normalization', () => {
    expectRefusal(
      () =>
        parseSeedEnv({
          ...validSeedEnv(),
          SEED_ADMIN_EMAIL: 'same@case-host.example.invalid',
          SEED_USER_EMAIL: '  SAME@Case-Host.Example.Invalid ',
        }),
      'SEED_ADMIN_EMAIL and SEED_USER_EMAIL: must be different',
    );
  });

  it('refuses a password of 7 characters without printing it', () => {
    expectRefusal(
      () => parseSeedEnv({ ...validSeedEnv(), SEED_ADMIN_PASSWORD: 'Ab1!xyz' }),
      'SEED_ADMIN_PASSWORD: must be at least 8 characters',
    );
  });

  it('accepts a password of 8 characters', () => {
    const config = parseSeedEnv({ ...validSeedEnv(), SEED_ADMIN_PASSWORD: 'Ab1!xyzw' });
    expect(config.admin.password).toBe('Ab1!xyzw');
  });

  it('accepts a password of exactly 72 bytes', () => {
    const password = 'a'.repeat(72);
    expect(parseSeedEnv({ ...validSeedEnv(), SEED_USER_PASSWORD: password }).user.password).toBe(
      password,
    );
  });

  it('refuses a password of 73 bytes', () => {
    expectRefusal(
      () => parseSeedEnv({ ...validSeedEnv(), SEED_USER_PASSWORD: 'a'.repeat(73) }),
      'SEED_USER_PASSWORD: must be at most 72 bytes in UTF-8',
    );
  });

  it('accepts 36 Cyrillic letters (72 bytes)', () => {
    const password = 'ї'.repeat(36);
    expect(Buffer.byteLength(password, 'utf8')).toBe(72);
    expect(parseSeedEnv({ ...validSeedEnv(), SEED_ADMIN_PASSWORD: password }).admin.password).toBe(
      password,
    );
  });

  it('refuses 37 Cyrillic letters: the limit is in bytes, not in characters', () => {
    const password = 'ї'.repeat(37);
    expect(password.length).toBeLessThanOrEqual(72);
    expectRefusal(
      () => parseSeedEnv({ ...validSeedEnv(), SEED_ADMIN_PASSWORD: password }),
      'SEED_ADMIN_PASSWORD: must be at most 72 bytes in UTF-8',
    );
  });
});

describe('assertSafeSeedTarget', () => {
  const validEnv = (): Record<string, string> => ({
    MONGODB_URI: 'mongodb://127.0.0.1:27017/talkshop-dev',
    ...validSeedEnv(),
  });

  it('returns the normalized config for a safe environment', () => {
    const config = assertSafeSeedTarget({
      ...validEnv(),
      SEED_ADMIN_EMAIL: `  ${ADMIN_EMAIL_MARKER.toUpperCase()} `,
    });
    expect(config).toEqual({
      admin: { email: ADMIN_EMAIL_MARKER, password: ADMIN_PASSWORD_MARKER },
      user: { email: USER_EMAIL_MARKER, password: USER_PASSWORD_MARKER },
    });
  });

  it.each([undefined, 'development', 'test'])('passes when NODE_ENV is %p', (nodeEnv) => {
    expect(() => assertSafeSeedTarget({ ...validEnv(), NODE_ENV: nodeEnv })).not.toThrow();
  });

  it('refuses NODE_ENV=production even when everything else is valid', () => {
    expectRefusal(
      () => assertSafeSeedTarget({ ...validEnv(), NODE_ENV: 'production' }),
      'Refusing to seed: NODE_ENV is "production"',
    );
  });

  it('checks production first, before the URI', () => {
    expectRefusal(
      () => assertSafeSeedTarget({ NODE_ENV: 'production', MONGODB_URI: 'nonsense' }),
      'Refusing to seed: NODE_ENV is "production"',
    );
  });

  it('refuses when MONGODB_URI is missing', () => {
    const env = validEnv();
    delete (env as Record<string, string | undefined>).MONGODB_URI;
    expectRefusal(() => assertSafeSeedTarget(env), INVALID_URI_MESSAGE);
  });

  it('refuses when MONGODB_URI is empty', () => {
    expectRefusal(
      () => assertSafeSeedTarget({ ...validEnv(), MONGODB_URI: '' }),
      INVALID_URI_MESSAGE,
    );
  });

  it('refuses a non-mongodb scheme without printing the URI', () => {
    expectRefusal(
      () => assertSafeSeedTarget({ ...validEnv(), MONGODB_URI: 'postgres://db.example.invalid/x' }),
      INVALID_URI_MESSAGE,
    );
  });

  it('refuses an unsafe database and does not leak URI credentials or the host', () => {
    expectRefusal(
      () =>
        assertSafeSeedTarget({ ...validEnv(), MONGODB_URI: uriWithCredentials('/talkshop-prod') }),
      'Refusing to seed database "talkshop-prod": allowed are exactly "talkshop-dev" or /^e2e_[0-9a-f]{12}$/ on a local host',
    );
  });

  it('accepts talkshop-dev on a remote cluster URI with credentials', () => {
    expect(() =>
      assertSafeSeedTarget({ ...validEnv(), MONGODB_URI: uriWithCredentials('/talkshop-dev') }),
    ).not.toThrow();
  });

  it('refuses invalid account variables after the URI is accepted', () => {
    expectRefusal(
      () => assertSafeSeedTarget({ ...validEnv(), SEED_USER_PASSWORD: '' }),
      'SEED_USER_PASSWORD: must be set',
    );
  });
});
