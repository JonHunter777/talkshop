import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { MaxBytes } from '../../common/validators/max-bytes.validator';
import { normalizeEmailInput } from './register.dto';

export class LoginDto {
  @ApiProperty({ example: 'user@example.com' })
  @Transform(normalizeEmailInput)
  @IsEmail()
  email!: string;

  // Cap size in bytes (bcrypt reads 72 bytes) so nobody makes the server hash a huge string
  @ApiProperty({
    example: 'correct-horse-battery',
    maxLength: 72,
    description: 'At most 72 bytes in UTF-8 (72 Latin characters or about 36 Cyrillic letters)',
  })
  @IsString()
  @IsNotEmpty()
  @MaxBytes(72)
  password!: string;
}
