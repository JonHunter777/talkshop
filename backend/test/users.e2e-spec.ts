import { ConflictException, INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { App } from 'supertest/types';
import { User } from '../src/users/schemas/user.schema';
import { UsersService } from '../src/users/users.service';
import { createTestApp } from './helpers/create-test-app';
import { dropTestDb } from './helpers/test-db';

const FAKE_HASH = '$2a$10$fakehashfakehashfakehashfakehashfakehashfakehashfak';

describe('UsersService (integration, in-memory MongoDB)', () => {
  let app: INestApplication<App>;
  let service: UsersService;
  let userModel: Model<User>;

  beforeAll(async () => {
    app = await createTestApp();
    service = app.get(UsersService);
    userModel = app.get<Model<User>>(getModelToken(User.name));
  });

  afterAll(async () => {
    await dropTestDb(app);
    await app.close();
  });

  beforeEach(async () => {
    await userModel.deleteMany({});
  });

  const createUser = (email = 'ann@example.com') =>
    service.create({ email, name: 'Ann', passwordHash: FAKE_HASH });

  describe('create', () => {
    it('stores the user with a trimmed, lowercased email', async () => {
      await createUser('  Ann@Example.COM ');

      const stored = await userModel.collection.findOne({});
      expect(stored?.email).toBe('ann@example.com');
    });

    it('stores createdAt and updatedAt as dates', async () => {
      await createUser();

      const stored = await userModel.collection.findOne({});
      expect(stored?.createdAt).toBeInstanceOf(Date);
      expect(stored?.updatedAt).toBeInstanceOf(Date);
    });

    it('stores the role "customer" even if a role is passed at runtime', async () => {
      // Runtime guard: the TS type forbids `role`, so we bypass it with a cast through unknown.
      const sneaky = {
        email: 'evil@example.com',
        name: 'Evil',
        passwordHash: FAKE_HASH,
        role: 'admin',
      } as unknown as Parameters<UsersService['create']>[0];

      await service.create(sneaky);

      const stored = await userModel.collection.findOne({ email: 'evil@example.com' });
      expect(stored?.role).toBe('customer');
    });

    it('rejects a duplicate email with other case/spaces and keeps one document', async () => {
      await createUser('ann@example.com');

      await expect(createUser('  ANN@Example.com ')).rejects.toBeInstanceOf(ConflictException);
      expect(await userModel.collection.countDocuments()).toBe(1);
    });

    it('lets exactly one of two parallel creates with the same email succeed', async () => {
      const results = await Promise.allSettled([createUser(), createUser()]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toBeInstanceOf(ConflictException);
      expect(await userModel.collection.countDocuments()).toBe(1);
    });
  });

  describe('findByEmail', () => {
    it('returns a document without passwordHash by default', async () => {
      await createUser();

      const found = await service.findByEmail('ANN@example.com');

      expect(found).not.toBeNull();
      expect(found?.passwordHash).toBeUndefined();
    });

    it('returns the stored passwordHash with { withPassword: true }', async () => {
      await createUser();

      const found = await service.findByEmail('ann@example.com', { withPassword: true });

      expect(found?.passwordHash).toBe(FAKE_HASH);
    });

    it('returns null for an unknown email', async () => {
      await expect(service.findByEmail('nobody@example.com')).resolves.toBeNull();
    });

    it('toJSON() does not contain passwordHash or __v', async () => {
      await createUser();
      const found = await service.findByEmail('ann@example.com', { withPassword: true });

      const json = found?.toJSON() as Record<string, unknown>;

      expect(json).not.toHaveProperty('passwordHash');
      expect(json).not.toHaveProperty('__v');
    });

    it('toObject() does not contain passwordHash or __v', async () => {
      await createUser();
      const found = await service.findByEmail('ann@example.com', { withPassword: true });

      const obj = found?.toObject() as Record<string, unknown>;

      expect(obj).not.toHaveProperty('passwordHash');
      expect(obj).not.toHaveProperty('__v');
    });
  });

  describe('findById', () => {
    it('returns the user for an existing id', async () => {
      const created = await createUser();

      const found = await service.findById(created._id.toString());

      expect(found?.email).toBe('ann@example.com');
    });

    it('returns null for a valid but unknown id', async () => {
      await expect(service.findById('507f1f77bcf86cd799439011')).resolves.toBeNull();
    });

    it('returns null for an invalid id', async () => {
      await expect(service.findById('abc')).resolves.toBeNull();
    });
  });
});
