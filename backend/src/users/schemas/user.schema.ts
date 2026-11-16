import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { ROLES, type Role } from '../../common/constants/roles';

@Schema({ timestamps: true })
export class User {
  @Prop({ type: String, required: true, trim: true, lowercase: true })
  email!: string;

  // Never returned by default queries; use .select('+passwordHash') only for login.
  @Prop({ type: String, required: true, select: false })
  passwordHash!: string;

  @Prop({ type: String, required: true, trim: true, minlength: 2, maxlength: 60 })
  name!: string;

  @Prop({ type: String, enum: ROLES, required: true, default: 'customer' })
  role!: Role;

  // Managed by `timestamps: true`; declared only so TypeScript knows about them.
  createdAt!: Date;
  updatedAt!: Date;
}

export type UserDocument = HydratedDocument<User>;

export const UserSchema = SchemaFactory.createForClass(User);

// Serves: login / findByEmail ({ email }) and duplicate-email protection on register.
// The unique index is atomic in the DB, so two parallel registrations cannot both succeed.
UserSchema.index({ email: 1 }, { unique: true });

// Safety net: even if passwordHash was selected explicitly, it never reaches JSON/API output.
type PrivateFields = { passwordHash?: string; __v?: number };

const stripPrivateFields = (_doc: unknown, ret: PrivateFields): PrivateFields => {
  delete ret.passwordHash;
  delete ret.__v;
  return ret;
};

UserSchema.set('toJSON', { transform: stripPrivateFields });
UserSchema.set('toObject', { transform: stripPrivateFields });
