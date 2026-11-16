import { ConflictException } from '@nestjs/common';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { toPublicUser, UsersService } from './users.service';

const FAKE_HASH = '$2a$10$fakehashfakehashfakehashfakehashfakehashfakehashfak';
const VALID_ID = '507f1f77bcf86cd799439011';

// A plain fake instead of a real Mongoose model: no database is needed in unit tests.
function createFakes() {
  const query = {
    select: jest.fn(),
    exec: jest.fn().mockResolvedValue(null),
  };
  const create = jest.fn();
  const findOne = jest.fn().mockReturnValue(query);
  const findById = jest.fn().mockReturnValue(query);
  const model = { create, findOne, findById } as unknown as Model<User>;
  return { service: new UsersService(model), query, create, findOne, findById };
}

describe('UsersService', () => {
  describe('create', () => {
    it('normalizes the email (trim + lowercase) before saving', async () => {
      const { service, create } = createFakes();
      create.mockResolvedValue({});

      await service.create({ email: ' A@B.com ', name: 'Ann', passwordHash: FAKE_HASH });

      expect(create).toHaveBeenCalledWith(expect.objectContaining({ email: 'a@b.com' }));
    });

    it('always saves the role "customer"', async () => {
      const { service, create } = createFakes();
      create.mockResolvedValue({});

      await service.create({ email: 'a@b.com', name: 'Ann', passwordHash: FAKE_HASH });

      expect(create).toHaveBeenCalledWith(expect.objectContaining({ role: 'customer' }));
    });

    it('passes the given hash and no plaintext password field', async () => {
      const { service, create } = createFakes();
      create.mockResolvedValue({});

      await service.create({ email: 'a@b.com', name: 'Ann', passwordHash: FAKE_HASH });

      expect(create).toHaveBeenCalledWith({
        email: 'a@b.com',
        name: 'Ann',
        passwordHash: FAKE_HASH,
        role: 'customer',
      });
    });

    it('maps a duplicate key error to ConflictException "Email already in use"', async () => {
      const { service, create } = createFakes();
      create.mockRejectedValue({ code: 11000 });

      const promise = service.create({ email: 'a@b.com', name: 'Ann', passwordHash: FAKE_HASH });

      await expect(promise).rejects.toBeInstanceOf(ConflictException);
      await expect(promise).rejects.toThrow('Email already in use');
    });

    it('does not leak the email or the hash in the conflict message', async () => {
      const { service, create } = createFakes();
      create.mockRejectedValue({ code: 11000 });

      const error: unknown = await service
        .create({ email: 'secret@b.com', name: 'Ann', passwordHash: FAKE_HASH })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      const message = (error as ConflictException).message;
      expect(message).not.toContain('secret@b.com');
      expect(message).not.toContain(FAKE_HASH);
    });

    it('rethrows other errors unchanged', async () => {
      const { service, create } = createFakes();
      const boom = new Error('db is down');
      create.mockRejectedValue(boom);

      const error: unknown = await service
        .create({ email: 'a@b.com', name: 'Ann', passwordHash: FAKE_HASH })
        .catch((e: unknown) => e);

      expect(error).toBe(boom);
    });
  });

  describe('findByEmail', () => {
    it('normalizes the email before querying', async () => {
      const { service, findOne } = createFakes();

      await service.findByEmail('  A@B.com ');

      expect(findOne).toHaveBeenCalledWith({ email: 'a@b.com' });
    });

    it('does not select the password hash by default', async () => {
      const { service, query } = createFakes();

      await service.findByEmail('a@b.com');

      expect(query.select).not.toHaveBeenCalled();
    });

    it('selects the password hash with { withPassword: true }', async () => {
      const { service, query } = createFakes();

      await service.findByEmail('a@b.com', { withPassword: true });

      expect(query.select).toHaveBeenCalledWith('+passwordHash');
    });

    it('returns what the query returns', async () => {
      const { service, query } = createFakes();
      const found = { email: 'a@b.com' };
      query.exec.mockResolvedValue(found);

      await expect(service.findByEmail('a@b.com')).resolves.toBe(found);
    });
  });

  describe('findById', () => {
    it.each([
      ['a short string', 'abc'],
      ['a 12-char string', 'abcdefghijkl'],
      ['an empty string', ''],
      ['23 chars', '507f1f77bcf86cd79943901'],
      ['25 chars', '507f1f77bcf86cd7994390111'],
    ])('returns null without touching the model for %s', async (_name, id) => {
      const { service, findById } = createFakes();

      await expect(service.findById(id)).resolves.toBeNull();
      expect(findById).not.toHaveBeenCalled();
    });

    it('queries the model for a valid 24-hex id', async () => {
      const { service, findById, query } = createFakes();
      const found = { id: VALID_ID };
      query.exec.mockResolvedValue(found);

      await expect(service.findById(VALID_ID)).resolves.toBe(found);
      expect(findById).toHaveBeenCalledWith(VALID_ID);
    });
  });

  describe('toPublicUser', () => {
    it('returns exactly id, email, name and role as plain values', () => {
      const doc = {
        _id: { toString: () => VALID_ID },
        email: 'a@b.com',
        name: 'Ann',
        role: 'customer',
      } as unknown as UserDocument;

      expect(toPublicUser(doc)).toEqual({
        id: VALID_ID,
        email: 'a@b.com',
        name: 'Ann',
        role: 'customer',
      });
    });

    it('does not include passwordHash even if the document has it', () => {
      const doc = {
        _id: { toString: () => VALID_ID },
        email: 'a@b.com',
        name: 'Ann',
        role: 'customer',
        passwordHash: FAKE_HASH,
      } as unknown as UserDocument;

      const result = toPublicUser(doc);

      expect(Object.keys(result).sort()).toEqual(['email', 'id', 'name', 'role']);
      expect(JSON.stringify(result)).not.toContain(FAKE_HASH);
    });
  });
});
