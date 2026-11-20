import { isEmail } from 'class-validator';
import { E2E_DB_NAME_PATTERN, LOCAL_DB_HOSTS, SEED_DEV_DB_NAME } from './seed-targets';

export { E2E_DB_NAME_PATTERN, LOCAL_DB_HOSTS, SEED_DEV_DB_NAME };

// Error messages contain only variable names, a safe database name and the rule.
// Never a URI, password, email or host (an Atlas host identifies the cluster).
export class SeedGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeedGuardError';
  }
}

export interface SeedAccount {
  email: string;
  password: string;
}

export interface SeedConfig {
  admin: SeedAccount;
  user: SeedAccount;
}

export interface MongoTarget {
  dbName: string;
  hosts: string[];
}

const INVALID_URI_MESSAGE = 'MONGODB_URI: must be a mongodb:// or mongodb+srv:// connection string';

// Parses scheme, hosts and database name by hand, without any network access.
// `new URL` is not used: it fails on multi-host strings like mongodb://h1,h2/db.
// Credentials (everything before the LAST "@" in the authority) are dropped immediately.
export function parseMongoTarget(uri: string): MongoTarget {
  const schemeMatch = /^mongodb(?:\+srv)?:\/\//.exec(uri);
  if (!schemeMatch) {
    throw new SeedGuardError(INVALID_URI_MESSAGE);
  }
  const rest = uri.slice(schemeMatch[0].length);

  // The authority ends at the first "/" or "?" (a URI may have a query but no path)
  const authorityEnd = rest.search(/[/?]/);
  const authority = authorityEnd === -1 ? rest : rest.slice(0, authorityEnd);
  const afterAuthority = authorityEnd === -1 ? '' : rest.slice(authorityEnd);

  const hostList = authority.slice(authority.lastIndexOf('@') + 1);
  const hosts = hostList.split(',').map(stripPort);
  if (hosts.some((host) => host === '')) {
    throw new SeedGuardError(INVALID_URI_MESSAGE);
  }

  // Path segment up to "?"; an URI starting with "?" has no path at all
  let dbName = '';
  if (afterAuthority.startsWith('/')) {
    const queryStart = afterAuthority.indexOf('?');
    dbName = afterAuthority.slice(1, queryStart === -1 ? undefined : queryStart);
  }

  return { dbName, hosts };
}

// "host:27017" -> "host"; "[::1]:27017" -> "[::1]" (IPv6 is never treated as local)
function stripPort(hostWithPort: string): string {
  if (hostWithPort.startsWith('[')) {
    const close = hostWithPort.indexOf(']');
    return close === -1 ? '' : hostWithPort.slice(0, close + 1);
  }
  const colon = hostWithPort.lastIndexOf(':');
  return colon === -1 ? hostWithPort : hostWithPort.slice(0, colon);
}

// A database name is printed only if it looks like a plain name. With a malformed URI
// (e.g. an unescaped "/" in a password) the "name" could be a piece of a secret.
function describeDb(dbName: string): string {
  return /^[A-Za-z0-9_-]{1,64}$/.test(dbName) ? `database "${dbName}"` : 'the target database';
}

// Allowed targets (exact rule, no suffix guessing):
// (a) database name is exactly "talkshop-dev", on any host;
// (b) name matches e2e_<12 hex> AND every host is 127.0.0.1 or localhost.
export function assertSafeDbTarget(uri: string): void {
  const { dbName, hosts } = parseMongoTarget(uri);

  if (dbName === '') {
    throw new SeedGuardError(
      `Refusing to seed: no database name in MONGODB_URI (allowed: "${SEED_DEV_DB_NAME}")`,
    );
  }
  if (dbName === SEED_DEV_DB_NAME) {
    return;
  }
  if (E2E_DB_NAME_PATTERN.test(dbName)) {
    if (hosts.every((host) => LOCAL_DB_HOSTS.includes(host))) {
      return;
    }
    throw new SeedGuardError(
      `Refusing to seed ${describeDb(dbName)}: e2e databases are allowed only on ${LOCAL_DB_HOSTS.join(' or ')}`,
    );
  }
  throw new SeedGuardError(
    `Refusing to seed ${describeDb(dbName)}: allowed are exactly "${SEED_DEV_DB_NAME}" or ${E2E_DB_NAME_PATTERN} on a local host`,
  );
}

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_BYTES = 72; // bcrypt uses only the first 72 BYTES, same cap as RegisterDto
const EMAIL_MAX_LENGTH = 254;

function readRequired(env: Record<string, string | undefined>, name: string): string {
  const value = env[name];
  if (value === undefined || value.trim() === '') {
    throw new SeedGuardError(`${name}: must be set`);
  }
  // A copied placeholder from .env.example, e.g. <admin-password>
  if (/^<.*>$/.test(value.trim())) {
    throw new SeedGuardError(`${name}: still contains a placeholder, set a real value`);
  }
  return value;
}

function readEmail(env: Record<string, string | undefined>, name: string): string {
  const email = readRequired(env, name).trim().toLowerCase();
  if (email.length > EMAIL_MAX_LENGTH || !isEmail(email)) {
    throw new SeedGuardError(`${name}: must be a valid email up to ${EMAIL_MAX_LENGTH} characters`);
  }
  return email;
}

function readPassword(env: Record<string, string | undefined>, name: string): string {
  const password = readRequired(env, name);
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new SeedGuardError(`${name}: must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }
  if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) {
    throw new SeedGuardError(`${name}: must be at most ${PASSWORD_MAX_BYTES} bytes in UTF-8`);
  }
  return password;
}

// Validates the demo account variables from env (see .env.example).
export function parseSeedEnv(env: Record<string, string | undefined>): SeedConfig {
  const admin = {
    email: readEmail(env, 'SEED_ADMIN_EMAIL'),
    password: readPassword(env, 'SEED_ADMIN_PASSWORD'),
  };
  const user = {
    email: readEmail(env, 'SEED_USER_EMAIL'),
    password: readPassword(env, 'SEED_USER_PASSWORD'),
  };
  if (admin.email === user.email) {
    throw new SeedGuardError('SEED_ADMIN_EMAIL and SEED_USER_EMAIL: must be different');
  }
  return { admin, user };
}

// Entry check for the seed script. Order: production flag, URI shape, database target, accounts.
// NODE_ENV undefined, "development" and "test" are allowed.
export function assertSafeSeedTarget(env: Record<string, string | undefined>): SeedConfig {
  if (env.NODE_ENV === 'production') {
    throw new SeedGuardError('Refusing to seed: NODE_ENV is "production"');
  }
  const uri = env.MONGODB_URI;
  if (typeof uri !== 'string' || uri === '' || !/^mongodb(?:\+srv)?:\/\//.test(uri)) {
    throw new SeedGuardError(INVALID_URI_MESSAGE);
  }
  assertSafeDbTarget(uri);
  return parseSeedEnv(env);
}
