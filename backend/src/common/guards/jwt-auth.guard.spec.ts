import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AuthenticatedRequest } from '../types/authenticated-request';
import { JwtAuthGuard } from './jwt-auth.guard';

const SECRET = 'unit-test-secret-0123456789-abcdefghij';
const OTHER_SECRET = 'another-secret-0123456789-abcdefghijk';
const USER_ID = '507f1f77bcf86cd799439011';

const toBase64Url = (value: object): string =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

describe('JwtAuthGuard', () => {
  let jwtService: JwtService;
  let guard: JwtAuthGuard;

  beforeEach(() => {
    jwtService = new JwtService({ secret: SECRET, signOptions: { algorithm: 'HS256' } });
    guard = new JwtAuthGuard(jwtService);
  });

  // A fake request with only what the guard reads: the Authorization header
  const buildRequest = (authorization?: string): AuthenticatedRequest =>
    ({ headers: authorization === undefined ? {} : { authorization } }) as AuthenticatedRequest;

  const buildContext = (request: AuthenticatedRequest): ExecutionContext =>
    ({ switchToHttp: () => ({ getRequest: () => request }) }) as unknown as ExecutionContext;

  const validToken = (payload: object = { sub: USER_ID, role: 'customer' }): string =>
    jwtService.sign(payload);

  // Runs the guard and returns the thrown error (fails the test if nothing is thrown)
  const getRejection = async (authorization?: string): Promise<unknown> => {
    const context = buildContext(buildRequest(authorization));
    try {
      await guard.canActivate(context);
    } catch (error) {
      return error;
    }
    throw new Error('Expected the guard to throw, but it returned');
  };

  describe('valid token', () => {
    it('returns true', async () => {
      const context = buildContext(buildRequest(`Bearer ${validToken()}`));

      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('sets request.user to { userId, role } taken from the token', async () => {
      const request = buildRequest(`Bearer ${validToken({ sub: USER_ID, role: 'admin' })}`);

      await guard.canActivate(buildContext(request));

      expect(request.user).toEqual({ userId: USER_ID, role: 'admin' });
    });
  });

  describe('rejected requests', () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const validPayload = { sub: USER_ID, role: 'customer' };

    // Each case builds the Authorization header that must be rejected
    const cases: Array<[string, () => string | undefined]> = [
      ['no Authorization header', () => undefined],
      ['empty Authorization header', () => ''],
      ['Basic scheme', () => 'Basic dXNlcjpwYXNz'],
      ['"Bearer" without a token', () => 'Bearer'],
      ['"Bearer " with an empty token', () => 'Bearer '],
      ['garbage instead of a token', () => 'Bearer not-a-jwt'],
      [
        'token signed with a different secret',
        () => `Bearer ${jwtService.sign(validPayload, { secret: OTHER_SECRET })}`,
      ],
      [
        'expired token',
        () => `Bearer ${jwtService.sign({ ...validPayload, exp: nowSeconds - 60 })}`,
      ],
      [
        'token with a tampered payload (role changed to admin, old signature)',
        () => {
          const [header, , signature] = validToken(validPayload).split('.');
          const forgedPayload = toBase64Url({ ...validPayload, role: 'admin', iat: nowSeconds });
          return `Bearer ${header}.${forgedPayload}.${signature}`;
        },
      ],
      [
        'unsigned token with alg "none"',
        () => `Bearer ${toBase64Url({ alg: 'none', typ: 'JWT' })}.${toBase64Url(validPayload)}.`,
      ],
      [
        'token signed with HS512 (only HS256 is allowed)',
        () => `Bearer ${jwtService.sign(validPayload, { algorithm: 'HS512' })}`,
      ],
      [
        'payload with sub that is not a 24-hex string',
        () => `Bearer ${validToken({ sub: 'not-an-object-id', role: 'customer' })}`,
      ],
      [
        'payload with a role outside ROLES',
        () => `Bearer ${validToken({ sub: USER_ID, role: 'superuser' })}`,
      ],
      ['payload without a role', () => `Bearer ${validToken({ sub: USER_ID })}`],
      ['payload without sub', () => `Bearer ${validToken({ role: 'customer' })}`],
    ];

    it.each(cases)('throws UnauthorizedException for: %s', async (_name, buildHeader) => {
      const error = await getRejection(buildHeader());

      expect(error).toBeInstanceOf(UnauthorizedException);
    });

    it.each(cases)(
      'uses the generic message "Unauthorized" for: %s',
      async (_name, buildHeader) => {
        const error = await getRejection(buildHeader());

        expect((error as UnauthorizedException).message).toBe('Unauthorized');
      },
    );

    it('gives exactly the same response body for every rejection reason', async () => {
      const bodies: unknown[] = [];
      for (const [, buildHeader] of cases) {
        const error = (await getRejection(buildHeader())) as UnauthorizedException;
        bodies.push(error.getResponse());
      }

      const uniqueBodies = new Set(bodies.map((body) => JSON.stringify(body)));
      expect(uniqueBodies.size).toBe(1);
    });

    it('does not set request.user for a rejected request', async () => {
      const request = buildRequest('Bearer not-a-jwt');

      await expect(guard.canActivate(buildContext(request))).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(request.user).toBeUndefined();
    });
  });

  describe('scheme case', () => {
    // Real behavior: the prefix check is case-sensitive, although RFC 7235 says the scheme
    // name should be case-insensitive. Documented here, not treated as a security hole.
    it('rejects the lower-case scheme "bearer " (the check is case-sensitive)', async () => {
      const error = await getRejection(`bearer ${validToken()}`);

      expect(error).toBeInstanceOf(UnauthorizedException);
    });
  });
});
