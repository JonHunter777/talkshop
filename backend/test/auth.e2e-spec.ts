import { Controller, Get, INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { Model, Types } from 'mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import { Auth } from '../src/common/decorators/auth.decorator';
import { CurrentUser } from '../src/common/decorators/current-user.decorator';
import type { AuthUser } from '../src/common/types/auth-user';
import { User } from '../src/users/schemas/user.schema';
import { createTestApp } from './helpers/create-test-app';
import { dropTestDb } from './helpers/test-db';
import { TEST_JWT_EXPIRES_IN_SECONDS } from './helpers/test-config';

// Test-only routes to check the guards through real HTTP
@Controller('test-protected')
class TestProtectedController {
  @Get('any-user')
  @Auth()
  anyUser(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }

  @Get('admin-only')
  @Auth('admin')
  adminOnly(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }
}

interface PublicUserBody {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface AuthBody {
  accessToken: string;
  expiresIn: number;
  user: PublicUserBody;
}

interface ErrorBody {
  statusCode: number;
  message: string | string[];
  error?: string;
}

const validRegisterBody = {
  email: 'ann@example.com',
  password: 'correct-horse-battery',
  name: 'Ann',
};

const toBase64Url = (value: object): string =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

describe('Auth API (e2e, in-memory MongoDB)', () => {
  let app: INestApplication<App>;
  let userModel: Model<User>;
  let jwtService: JwtService;

  beforeAll(async () => {
    app = await createTestApp({ extraControllers: [TestProtectedController] });
    userModel = app.get<Model<User>>(getModelToken(User.name));
    jwtService = app.get(JwtService);
  });

  afterAll(async () => {
    await dropTestDb(app);
    await app.close();
  });

  beforeEach(async () => {
    await userModel.deleteMany({});
  });

  const register = (body: object) =>
    request(app.getHttpServer()).post('/api/auth/register').send(body);

  const login = (body: object) => request(app.getHttpServer()).post('/api/auth/login').send(body);

  const getMe = (authorization?: string) => {
    const req = request(app.getHttpServer()).get('/api/auth/me');
    return authorization === undefined ? req : req.set('Authorization', authorization);
  };

  // Registers the default user and returns the response body
  const registerAnn = async (): Promise<AuthBody> => {
    const res = await register(validRegisterBody).expect(201);
    return res.body as AuthBody;
  };

  describe('POST /api/auth/register', () => {
    it('returns 201 with accessToken, expiresIn and the public user', async () => {
      const res = await register(validRegisterBody).expect(201);

      const body = res.body as AuthBody;
      expect(body.accessToken).toEqual(expect.any(String));
      expect(body.expiresIn).toBe(TEST_JWT_EXPIRES_IN_SECONDS);
      expect(body.user).toEqual({
        id: expect.stringMatching(/^[0-9a-f]{24}$/) as string,
        email: 'ann@example.com',
        name: 'Ann',
        role: 'customer',
      });
    });

    it('never returns passwordHash or the password in the response', async () => {
      const res = await register(validRegisterBody).expect(201);

      const text = JSON.stringify(res.body);
      expect(text).not.toContain('passwordHash');
      expect(text).not.toContain(validRegisterBody.password);
      expect(text).not.toContain('$2');
    });

    it('stores a bcrypt hash (not the password) and a lowercased email', async () => {
      await register({ ...validRegisterBody, email: '  Ann@Example.COM ' }).expect(201);

      const stored = await userModel.collection.findOne({});
      const hash = String(stored?.passwordHash);
      expect(stored?.email).toBe('ann@example.com');
      expect(hash).not.toBe(validRegisterBody.password);
      expect(hash).toMatch(/^\$2[aby]\$/);
      await expect(bcrypt.compare(validRegisterBody.password, hash)).resolves.toBe(true);
    });

    it('returns a token whose payload has sub = user id and role = customer', async () => {
      const body = await registerAnn();

      const payload = await jwtService.verifyAsync<Record<string, unknown>>(body.accessToken);
      expect(payload).toMatchObject({ sub: body.user.id, role: 'customer' });
    });

    it('returns 400 and creates no user when the body contains role "admin"', async () => {
      const res = await register({ ...validRegisterBody, role: 'admin' }).expect(400);

      expect((res.body as ErrorBody).message).toEqual(expect.arrayContaining([expect.any(String)]));
      expect(await userModel.collection.countDocuments()).toBe(0);
    });

    it('returns 400 for other extra fields', async () => {
      await register({ ...validRegisterBody, isVerified: true }).expect(400);

      expect(await userModel.collection.countDocuments()).toBe(0);
    });

    it('returns 409 for a duplicate email written in a different case', async () => {
      await register(validRegisterBody).expect(201);

      await register({ ...validRegisterBody, email: 'ANN@Example.com' }).expect(409);

      expect(await userModel.collection.countDocuments()).toBe(1);
    });

    it('lets exactly one of two parallel registrations with the same email succeed', async () => {
      const results = await Promise.all([register(validRegisterBody), register(validRegisterBody)]);

      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(await userModel.collection.countDocuments()).toBe(1);
    });

    it.each([
      ['an invalid email', { email: 'not-an-email' }],
      ['a password shorter than 8 characters', { password: '1234567' }],
      ['a name shorter than 2 characters', { name: 'A' }],
    ])('returns 400 with a message array for %s', async (_title, override) => {
      const res = await register({ ...validRegisterBody, ...override }).expect(400);

      const body = res.body as ErrorBody;
      expect(Array.isArray(body.message)).toBe(true);
      expect(body.message).not.toHaveLength(0);
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await registerAnn();
    });

    it('returns 200 with a token and the public user', async () => {
      const res = await login({
        email: validRegisterBody.email,
        password: validRegisterBody.password,
      }).expect(200);

      const body = res.body as AuthBody;
      expect(body.accessToken).toEqual(expect.any(String));
      expect(body.expiresIn).toBe(TEST_JWT_EXPIRES_IN_SECONDS);
      expect(body.user).toMatchObject({ email: 'ann@example.com', role: 'customer' });
      expect(JSON.stringify(body)).not.toContain('passwordHash');
    });

    it('treats the email as case-insensitive', async () => {
      await login({ email: '  ANN@EXAMPLE.COM ', password: validRegisterBody.password }).expect(
        200,
      );
    });

    it('returns 401 for a wrong password', async () => {
      await login({ email: validRegisterBody.email, password: 'wrong-password' }).expect(401);
    });

    it('returns 401 for an unknown email', async () => {
      await login({ email: 'nobody@example.com', password: 'whatever-123' }).expect(401);
    });

    it('returns the identical 401 body for a wrong password and for an unknown email', async () => {
      const wrongPassword = await login({
        email: validRegisterBody.email,
        password: 'wrong-password',
      });
      const unknownEmail = await login({ email: 'nobody@example.com', password: 'wrong-password' });

      expect(wrongPassword.status).toBe(401);
      expect(unknownEmail.status).toBe(401);
      expect(wrongPassword.body).toEqual(unknownEmail.body);
      expect((wrongPassword.body as ErrorBody).message).toBe('Invalid email or password');
    });

    it('returns 400 for an empty password', async () => {
      await login({ email: validRegisterBody.email, password: '' }).expect(400);
    });
  });

  describe('password length is limited in BYTES (bcrypt only uses the first 72 bytes)', () => {
    const byteLimitMessage = 'password must be at most 72 bytes in UTF-8';
    const messagesOf = (res: { body: unknown }): string[] => {
      const message = (res.body as ErrorBody).message;
      return Array.isArray(message) ? message : [message];
    };

    // 'я' = 2 bytes
    const cyrillic36 = 'я'.repeat(36); // 72 bytes
    const cyrillic72 = 'я'.repeat(72); // 144 bytes
    // 'a' (1) + 35 x 'я' (70) + 'b' (1) = 72 bytes
    const mixed72Bytes = 'a' + 'я'.repeat(35) + 'b';
    // 'a' (1) + 36 x 'я' (72) = 73 bytes
    const mixed73Bytes = 'a' + 'я'.repeat(36);

    it('register returns 400 for 72 Cyrillic letters (144 bytes) with the byte-limit message', async () => {
      const res = await register({ ...validRegisterBody, password: cyrillic72 }).expect(400);

      expect(messagesOf(res)).toEqual(
        expect.arrayContaining([expect.stringContaining(byteLimitMessage)]),
      );
    });

    it('register does not echo the rejected password in the response', async () => {
      const res = await register({ ...validRegisterBody, password: cyrillic72 }).expect(400);

      expect(JSON.stringify(res.body)).not.toContain(cyrillic72);
    });

    it('register creates no user when the password is too long in bytes', async () => {
      await register({ ...validRegisterBody, password: cyrillic72 }).expect(400);

      expect(await userModel.collection.countDocuments()).toBe(0);
    });

    it('register returns 201 for 36 Cyrillic letters (exactly 72 bytes)', async () => {
      await register({ ...validRegisterBody, password: cyrillic36 }).expect(201);
    });

    it('login returns 200 with the same 36-letter Cyrillic password', async () => {
      await register({ ...validRegisterBody, password: cyrillic36 }).expect(201);

      await login({ email: validRegisterBody.email, password: cyrillic36 }).expect(200);
    });

    it('login returns 400 (not a silent 200) for the 36-letter password plus one extra letter', async () => {
      await register({ ...validRegisterBody, password: cyrillic36 }).expect(201);

      await login({ email: validRegisterBody.email, password: 'я'.repeat(37) }).expect(400);
    });

    it('login returns 400 for 72 Cyrillic letters', async () => {
      await register({ ...validRegisterBody, password: cyrillic36 }).expect(201);

      await login({ email: validRegisterBody.email, password: cyrillic72 }).expect(400);
    });

    it('register returns 201 for 72 ASCII characters', async () => {
      await register({ ...validRegisterBody, password: 'a'.repeat(72) }).expect(201);
    });

    it('register returns 400 for 73 ASCII characters', async () => {
      await register({ ...validRegisterBody, password: 'a'.repeat(73) }).expect(400);
    });

    it('register returns 201 for a mixed ASCII + Cyrillic password of exactly 72 bytes', async () => {
      expect(Buffer.byteLength(mixed72Bytes, 'utf8')).toBe(72);

      await register({ ...validRegisterBody, password: mixed72Bytes }).expect(201);
    });

    it('register returns 400 for a mixed ASCII + Cyrillic password of 73 bytes', async () => {
      expect(Buffer.byteLength(mixed73Bytes, 'utf8')).toBe(73);

      await register({ ...validRegisterBody, password: mixed73Bytes }).expect(400);
    });
  });

  describe('GET /api/auth/me', () => {
    const tokenFor = (sub: string, expiresIn?: number): string =>
      jwtService.sign({ sub, role: 'customer' }, expiresIn === undefined ? {} : { expiresIn });

    it('returns 401 without a token', async () => {
      await getMe().expect(401);
    });

    it('returns 200 with the same user for a valid token', async () => {
      const registered = await registerAnn();

      const res = await getMe(`Bearer ${registered.accessToken}`).expect(200);

      expect(res.body).toEqual(registered.user);
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    });

    it('returns 404 for a valid token of a deleted user', async () => {
      const registered = await registerAnn();
      await userModel.deleteMany({});

      await getMe(`Bearer ${registered.accessToken}`).expect(404);
    });

    it('returns 404 (not 500) for a valid token with an id that never existed', async () => {
      await getMe(`Bearer ${tokenFor(new Types.ObjectId().toString())}`).expect(404);
    });

    describe('rejected tokens', () => {
      const userId = new Types.ObjectId().toString();

      const badAuthorizations: Array<[string, () => string]> = [
        ['garbage', () => 'Bearer not-a-jwt'],
        ['expired', () => `Bearer ${tokenFor(userId, -60)}`],
        [
          'signed with a wrong secret',
          () =>
            `Bearer ${jwtService.sign({ sub: userId, role: 'customer' }, { secret: 'x'.repeat(40) })}`,
        ],
        [
          'alg none',
          () =>
            `Bearer ${toBase64Url({ alg: 'none', typ: 'JWT' })}.${toBase64Url({ sub: userId, role: 'admin' })}.`,
        ],
        ['without the Bearer prefix', () => tokenFor(userId)],
      ];

      it.each(badAuthorizations)('returns 401 for a token that is %s', async (_title, build) => {
        await getMe(build()).expect(401);
      });

      it('returns the same 401 body for every kind of bad token, without the reason', async () => {
        const bodies: unknown[] = [];
        for (const [, build] of badAuthorizations) {
          const res = await getMe(build()).expect(401);
          bodies.push(res.body);
        }

        const first = JSON.stringify(bodies[0]);
        for (const body of bodies) {
          expect(JSON.stringify(body)).toBe(first);
        }
        expect((bodies[0] as ErrorBody).message).toBe('Unauthorized');
        expect(first.toLowerCase()).not.toMatch(/expired|signature|malformed|algorithm|secret/);
      });
    });
  });

  describe('role-protected routes (@Auth and @Auth("admin"))', () => {
    const getRoute = (path: string, token?: string) => {
      const req = request(app.getHttpServer()).get(`/api/test-protected/${path}`);
      return token === undefined ? req : req.set('Authorization', `Bearer ${token}`);
    };

    // Admins are never created through register: insert directly and sign a token
    const createAdminToken = async (): Promise<{ id: string; token: string }> => {
      const admin = await userModel.create({
        email: 'admin@example.com',
        name: 'Admin',
        passwordHash: '$2b$10$CY.xIkSQky7m1H3BWB4GQujOiQOZZ0D3xkPvW1.JT8fRWeq7VU1hC',
        role: 'admin',
      });
      const id = admin._id.toString();
      return { id, token: jwtService.sign({ sub: id, role: admin.role }) };
    };

    it('returns 401 on both routes without a token', async () => {
      await getRoute('any-user').expect(401);
      await getRoute('admin-only').expect(401);
    });

    it('lets a customer into the @Auth() route', async () => {
      const registered = await registerAnn();

      const res = await getRoute('any-user', registered.accessToken).expect(200);

      expect(res.body).toEqual({ userId: registered.user.id, role: 'customer' });
    });

    it('returns 403 for a customer on the admin route', async () => {
      const registered = await registerAnn();

      await getRoute('admin-only', registered.accessToken).expect(403);
    });

    it('lets an admin into the @Auth() route', async () => {
      const admin = await createAdminToken();

      const res = await getRoute('any-user', admin.token).expect(200);

      expect(res.body).toEqual({ userId: admin.id, role: 'admin' });
    });

    it('lets an admin into the admin route', async () => {
      const admin = await createAdminToken();

      await getRoute('admin-only', admin.token).expect(200);
    });
  });
});
