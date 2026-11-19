import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsObject,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { isDefined } from '../../common/utils/is-defined';
import { trimInput } from '../../common/utils/trim-input';

export const MAX_PHONE_LENGTH = 20;
export const MIN_PHONE_DIGITS = 7;

// Allowed characters: digits, spaces, parentheses, hyphens and an optional leading "+".
// The lookahead requires at least 7 digits, so "-------" or "( ) ( )" is not a phone number.
// The length limit (20, counting the "+") is a separate @MaxLength, not part of this pattern.
const PHONE_REGEX = new RegExp(`^(?=(?:\\D*\\d){${MIN_PHONE_DIGITS}})\\+?[0-9 ()-]+$`);

// The whole order body is only the shipping data and a note. There are no price, total, status,
// userId or items fields on purpose: the server takes the items from the cart, the prices from
// the products and the user from the JWT. With forbidNonWhitelisted an extra field gives 400.
export class ShippingDto {
  @ApiProperty({ example: 'Ivan Petrenko', minLength: 2, maxLength: 100 })
  @Transform(trimInput)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName!: string;

  @ApiProperty({
    example: '+380 (50) 123-45-67',
    maxLength: MAX_PHONE_LENGTH,
    description: `At most ${MAX_PHONE_LENGTH} characters including "+", at least ${MIN_PHONE_DIGITS} digits`,
  })
  @Transform(trimInput)
  @IsString()
  @MaxLength(MAX_PHONE_LENGTH)
  @Matches(PHONE_REGEX, {
    message: `phone must contain at least ${MIN_PHONE_DIGITS} digits and only digits, spaces, parentheses, hyphens and an optional leading +`,
  })
  phone!: string;

  @ApiProperty({ example: 'Kyiv', minLength: 2, maxLength: 100 })
  @Transform(trimInput)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  city!: string;

  @ApiProperty({ example: 'Khreshchatyk St, 1, apt 5', minLength: 5, maxLength: 200 })
  @Transform(trimInput)
  @IsString()
  @MinLength(5)
  @MaxLength(200)
  address!: string;
}

export class CreateOrderDto {
  @ApiProperty({ type: ShippingDto })
  @IsObject()
  @ValidateNested()
  @Type(() => ShippingDto)
  shipping!: ShippingDto;

  @ApiPropertyOptional({ example: 'Call before delivery', minLength: 1, maxLength: 500 })
  @ValidateIf(isDefined)
  @Transform(trimInput)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  note?: string;
}
