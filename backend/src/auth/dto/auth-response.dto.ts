import { ApiProperty } from '@nestjs/swagger';
import { ROLES, type Role } from '../../common/constants/roles';

export class AuthUserDto {
  @ApiProperty({ example: '665f1c2e8a1b2c3d4e5f6a7b' })
  id!: string;

  @ApiProperty({ example: 'user@example.com' })
  email!: string;

  @ApiProperty({ example: 'Ivan Petrov' })
  name!: string;

  @ApiProperty({ enum: ROLES, example: 'customer' })
  role!: Role;
}

export class AuthResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  accessToken!: string;

  @ApiProperty({ description: 'Token lifetime in seconds', example: 3600 })
  expiresIn!: number;

  @ApiProperty({ type: AuthUserDto })
  user!: AuthUserDto;
}
