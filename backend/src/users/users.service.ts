import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { isDuplicateKeyError } from '../common/utils/mongo-errors';
import { isObjectIdString } from '../common/utils/object-id';
import { User, UserDocument } from './schemas/user.schema';
import { CreateUserData, FindByEmailOptions, PublicUser } from './users.types';

// Same normalization as the schema (trim + lowercase), so lookups always match stored values
const normalizeEmail = (email: string): string => email.trim().toLowerCase();

// Maps a document to the shape that is safe to return from the API
export function toPublicUser(user: UserDocument): PublicUser {
  return { id: user._id.toString(), email: user.email, name: user.name, role: user.role };
}

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private readonly userModel: Model<User>) {}

  async create(data: CreateUserData): Promise<UserDocument> {
    try {
      return await this.userModel.create({
        email: normalizeEmail(data.email),
        name: data.name,
        passwordHash: data.passwordHash,
        // Always a customer: admins are created only by the seed script
        role: 'customer',
      });
    } catch (error) {
      // The unique index is the real protection against parallel registrations
      if (isDuplicateKeyError(error)) {
        throw new ConflictException('Email already in use');
      }
      throw error;
    }
  }

  async findByEmail(email: string, options?: FindByEmailOptions): Promise<UserDocument | null> {
    const query = this.userModel.findOne({ email: normalizeEmail(email) });
    // passwordHash is select:false, so it must be requested explicitly (login only)
    if (options?.withPassword) {
      query.select('+passwordHash');
    }
    return query.exec();
  }

  async findById(id: string): Promise<UserDocument | null> {
    // Invalid id means "no such user", not a CastError (500)
    if (!isObjectIdString(id)) {
      return null;
    }
    return this.userModel.findById(id).exec();
  }
}
