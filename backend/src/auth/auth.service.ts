import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { BCRYPT_ROUNDS, DUMMY_HASH } from '../common/constants/auth';
import { toPublicUser, UsersService } from '../users/users.service';
import type { PublicUser } from '../users/users.types';
import type { UserDocument } from '../users/schemas/user.schema';
import type { AuthResponseDto } from './dto/auth-response.dto';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    // A duplicate email throws 409 inside UsersService
    const user = await this.usersService.create({
      email: dto.email,
      name: dto.name,
      passwordHash,
    });
    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.usersService.findByEmail(dto.email, { withPassword: true });
    // Read the hash from the document: toObject() would strip it (select: false)
    const hash = user?.passwordHash ?? DUMMY_HASH;
    const isMatch = await bcrypt.compare(dto.password, hash);
    if (!user || !isMatch) {
      // Same message for unknown email and wrong password
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.buildAuthResponse(user);
  }

  async me(userId: string): Promise<PublicUser> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return toPublicUser(user);
  }

  private async buildAuthResponse(user: UserDocument): Promise<AuthResponseDto> {
    const accessToken = await this.jwtService.signAsync({
      sub: user._id.toString(),
      role: user.role,
    });
    return {
      accessToken,
      expiresIn: this.config.getOrThrow<number>('JWT_EXPIRES_IN_SECONDS'),
      user: toPublicUser(user),
    };
  }
}
