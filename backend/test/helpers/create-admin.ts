import { randomBytes } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../../src/users/schemas/user.schema';

// A bcrypt-shaped string that nobody can log in with: these users never use the login route
const UNUSABLE_HASH = '$2b$10$CY.xIkSQky7m1H3BWB4GQujOiQOZZ0D3xkPvW1.JT8fRWeq7VU1hC';

export interface TestAdmin {
  id: string;
  token: string;
}

// Admin routes check the CURRENT role in the database (RolesGuard), so an admin token for a
// random id is not enough any more: the user must really exist with the role "admin".
// Admins are never created through register: insert directly and sign a token.
export async function createAdmin(app: INestApplication): Promise<TestAdmin> {
  const userModel = app.get<Model<User>>(getModelToken(User.name));
  const admin = await userModel.create({
    email: `admin-${randomBytes(4).toString('hex')}@example.com`,
    name: 'Admin',
    passwordHash: UNUSABLE_HASH,
    role: 'admin',
  });
  const id = admin._id.toString();
  return { id, token: app.get(JwtService).sign({ sub: id, role: 'admin' }) };
}
