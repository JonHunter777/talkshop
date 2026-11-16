import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { MaxBytes } from '../../common/validators/max-bytes.validator';

// Normalize before validation so "  User@Mail.COM " becomes "user@mail.com"
export const normalizeEmailInput = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

const trimInput = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

// No `role` field on purpose: with forbidNonWhitelisted an extra field gives 400
export class RegisterDto {
  @ApiProperty({ example: 'user@example.com', maxLength: 254 })
  @Transform(normalizeEmailInput)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  // bcrypt only uses the first 72 BYTES (not characters), so the cap is in bytes:
  // otherwise a long Cyrillic password would be silently truncated.
  // No composition rules (digits, symbols): length matters more.
  @ApiProperty({
    example: 'correct-horse-battery',
    minLength: 8,
    maxLength: 72,
    description: 'At most 72 bytes in UTF-8 (72 Latin characters or about 36 Cyrillic letters)',
  })
  @IsString()
  @MinLength(8)
  @MaxBytes(72)
  password!: string;

  @ApiProperty({ example: 'Ivan Petrov', minLength: 2, maxLength: 60 })
  @Transform(trimInput)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name!: string;
}
