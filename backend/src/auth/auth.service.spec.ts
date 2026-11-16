import { ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import type { UserDocument } from '../users/schemas/user.schema';
import type { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

const SECRET = 'unit-test-secret-0123456789-abcdefghij';
const EXPIRES_IN_SECONDS = 900;
const PASSWORD = 'correct-horse-battery';

interface FakeUserOptions {
  email?: string;
  passwordHash?: string;
  role?: 'customer' | 'admin';
}

// A fake mongoose document. Like the real one, toObject() does NOT contain passwordHash,
// so the service must read the hash from the document field itself.
function buildUser({
  email = 'ann@example.com',
  passwordHash = 'unused',
  role = 'customer',
}: FakeUserOptions = {}): UserDocument {
  const id = new Types.ObjectId();
  return {
    _id: id,
    email,
    name: 'Ann',
    role,
    passwordHash,
    toObject: () => ({ _id: id, email, name: 'Ann', role }),
  } as unknown as UserDocument;
}

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: JwtService;
  let usersService: { create: jest.Mock; findByEmail: jest.Mock; findById: jest.Mock };
  let realHash: string;

  beforeAll(async () => {
    realHash = await bcrypt.hash(PASSWORD, 4);
  });

  beforeEach(() => {
    usersService = { create: jest.fn(), findByEmail: jest.fn(), findById: jest.fn() };
    jwtService = new JwtService({
      secret: SECRET,
      signOptions: { algorithm: 'HS256', expiresIn: EXPIRES_IN_SECONDS },
    });
    const config = { getOrThrow: jest.fn().mockReturnValue(EXPIRES_IN_SECONDS) };
    service = new AuthService(
      usersService as unknown as UsersService,
      jwtService,
      config as unknown as ConfigService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('register', () => {
    const dto = { email: 'ann@example.com', name: 'Ann', password: PASSWORD };

    // Returns what UsersService.create received
    const registerAndGetStoredData = async (): Promise<Record<string, unknown>> => {
      usersService.create.mockImplementation((data: { passwordHash: string }) =>
        Promise.resolve(buildUser({ passwordHash: data.passwordHash })),
      );
      await service.register(dto);
      return (usersService.create.mock.calls as Array<[Record<string, unknown>]>)[0][0];
    };

    it('stores a bcrypt hash that differs from the password', async () => {
      const stored = await registerAndGetStoredData();

      expect(stored.passwordHash).not.toBe(PASSWORD);
      expect(stored.passwordHash).toEqual(expect.stringMatching(/^\$2[aby]\$/));
    });

    it('stores a hash that matches the password with bcrypt.compare', async () => {
      const stored = await registerAndGetStoredData();

      await expect(bcrypt.compare(PASSWORD, stored.passwordHash as string)).resolves.toBe(true);
    });

    it('passes only { email, name, passwordHash } to UsersService (no role, no plaintext)', async () => {
      const stored = await registerAndGetStoredData();

      expect(Object.keys(stored).sort()).toEqual(['email', 'name', 'passwordHash']);
      expect(JSON.stringify(stored)).not.toContain(PASSWORD);
    });

    it('returns accessToken, expiresIn and the public user', async () => {
      const created = buildUser();
      usersService.create.mockResolvedValue(created);

      const result = await service.register(dto);

      expect(result).toEqual({
        accessToken: expect.any(String) as string,
        expiresIn: EXPIRES_IN_SECONDS,
        user: {
          id: created._id.toString(),
          email: 'ann@example.com',
          name: 'Ann',
          role: 'customer',
        },
      });
    });

    it('does not return passwordHash or the password anywhere in the response', async () => {
      usersService.create.mockResolvedValue(buildUser({ passwordHash: realHash }));

      const json = JSON.stringify(await service.register(dto));

      expect(json).not.toContain('passwordHash');
      expect(json).not.toContain(realHash);
      expect(json).not.toContain(PASSWORD);
    });

    it('signs a token with the payload { sub: id string, role: "customer" }', async () => {
      const created = buildUser();
      usersService.create.mockResolvedValue(created);

      const { accessToken } = await service.register(dto);

      const payload = await jwtService.verifyAsync<Record<string, unknown>>(accessToken);
      expect(payload).toMatchObject({ sub: created._id.toString(), role: 'customer' });
      expect(typeof payload.sub).toBe('string');
    });

    it('sets the token expiry from the configured number of seconds', async () => {
      usersService.create.mockResolvedValue(buildUser());

      const { accessToken } = await service.register(dto);

      const payload = await jwtService.verifyAsync<{ iat: number; exp: number }>(accessToken);
      expect(payload.exp - payload.iat).toBe(EXPIRES_IN_SECONDS);
    });

    it('lets the 409 from UsersService propagate for a duplicate email', async () => {
      usersService.create.mockRejectedValue(new ConflictException('Email already in use'));

      await expect(service.register(dto)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('login', () => {
    const dto = { email: 'ann@example.com', password: PASSWORD };

    it('returns accessToken, expiresIn and the public user for correct credentials', async () => {
      const user = buildUser({ passwordHash: realHash });
      usersService.findByEmail.mockResolvedValue(user);

      const result = await service.login(dto);

      expect(result).toEqual({
        accessToken: expect.any(String) as string,
        expiresIn: EXPIRES_IN_SECONDS,
        user: { id: user._id.toString(), email: 'ann@example.com', name: 'Ann', role: 'customer' },
      });
    });

    it('asks UsersService for the user together with the password hash', async () => {
      usersService.findByEmail.mockResolvedValue(buildUser({ passwordHash: realHash }));

      await service.login(dto);

      expect(usersService.findByEmail).toHaveBeenCalledWith('ann@example.com', {
        withPassword: true,
      });
    });

    it('puts the role of the stored user into the token', async () => {
      const admin = buildUser({ passwordHash: realHash, role: 'admin' });
      usersService.findByEmail.mockResolvedValue(admin);

      const { accessToken } = await service.login(dto);

      const payload = await jwtService.verifyAsync<Record<string, unknown>>(accessToken);
      expect(payload).toMatchObject({ sub: admin._id.toString(), role: 'admin' });
    });

    it('compares against user.passwordHash from the document (toObject() has no hash)', async () => {
      const user = buildUser({ passwordHash: realHash });
      expect(user.toObject()).not.toHaveProperty('passwordHash');
      usersService.findByEmail.mockResolvedValue(user);
      const compareSpy = jest.spyOn(bcrypt, 'compare');

      await service.login(dto);

      expect(compareSpy).toHaveBeenCalledWith(PASSWORD, realHash);
    });

    it('throws UnauthorizedException("Invalid email or password") for a wrong password', async () => {
      usersService.findByEmail.mockResolvedValue(buildUser({ passwordHash: realHash }));

      const attempt = service.login({ ...dto, password: 'wrong-password-123' });

      await expect(attempt).rejects.toThrow(new UnauthorizedException('Invalid email or password'));
    });

    it('throws UnauthorizedException("Invalid email or password") for an unknown email', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      const attempt = service.login(dto);

      await expect(attempt).rejects.toThrow(new UnauthorizedException('Invalid email or password'));
    });

    it('gives the same error body for an unknown email and for a wrong password', async () => {
      usersService.findByEmail.mockResolvedValueOnce(null);
      const unknownEmail = (await service
        .login(dto)
        .catch((e: unknown) => e)) as UnauthorizedException;
      usersService.findByEmail.mockResolvedValueOnce(buildUser({ passwordHash: realHash }));
      const wrongPassword = (await service
        .login({ ...dto, password: 'wrong-password-123' })
        .catch((e: unknown) => e)) as UnauthorizedException;

      expect(unknownEmail).toBeInstanceOf(UnauthorizedException);
      expect(wrongPassword).toBeInstanceOf(UnauthorizedException);
      expect(unknownEmail.getResponse()).toEqual(wrongPassword.getResponse());
    });

    it('still runs bcrypt.compare against a dummy hash when the email is unknown', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      const compareSpy = jest.spyOn(bcrypt, 'compare');

      await service.login(dto).catch(() => undefined);

      expect(compareSpy).toHaveBeenCalledTimes(1);
      expect(compareSpy).toHaveBeenCalledWith(PASSWORD, expect.stringMatching(/^\$2[aby]\$10\$/));
    });

    it('does not leak the password or the hash in the error message', async () => {
      usersService.findByEmail.mockResolvedValue(buildUser({ passwordHash: realHash }));

      const error = (await service
        .login({ ...dto, password: 'wrong-password-123' })
        .catch((e: unknown) => e)) as UnauthorizedException;

      const text = JSON.stringify(error.getResponse()) + error.message;
      expect(text).not.toContain('wrong-password-123');
      expect(text).not.toContain(realHash);
    });
  });

  describe('me', () => {
    it('returns the public user', async () => {
      const user = buildUser({ passwordHash: realHash });
      usersService.findById.mockResolvedValue(user);

      const result = await service.me(user._id.toString());

      expect(result).toEqual({
        id: user._id.toString(),
        email: 'ann@example.com',
        name: 'Ann',
        role: 'customer',
      });
    });

    it('throws NotFoundException("User not found") when the user does not exist', async () => {
      usersService.findById.mockResolvedValue(null);

      await expect(service.me('507f1f77bcf86cd799439011')).rejects.toThrow(
        new NotFoundException('User not found'),
      );
    });
  });
});
