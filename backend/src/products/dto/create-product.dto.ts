import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  MAX_PRICE_CENTS,
  MAX_PRODUCT_IMAGES,
  MAX_PRODUCT_STOCK,
  MIN_PRICE_CENTS,
  PRODUCT_CATEGORIES,
  type ProductCategory,
} from '../../common/constants/shop';
import { isDefined } from '../../common/utils/is-defined';
import { trimInput } from '../../common/utils/trim-input';

// Lowercase latin words joined by single hyphens: "linen-tablecloth-120"
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Optional fields use `@ValidateIf(isDefined)`: absent is fine, `null` is not.
// To clear a field via PATCH, send an empty string or an empty array.
export class ProductAttributesDto {
  @ApiPropertyOptional({ example: 'linen', maxLength: 100 })
  @ValidateIf(isDefined)
  @Transform(trimInput)
  @IsString()
  @MaxLength(100)
  material?: string;

  @ApiPropertyOptional({ example: '120x180 cm', maxLength: 100 })
  @ValidateIf(isDefined)
  @Transform(trimInput)
  @IsString()
  @MaxLength(100)
  size?: string;

  @ApiPropertyOptional({ example: 'beige', maxLength: 100 })
  @ValidateIf(isDefined)
  @Transform(trimInput)
  @IsString()
  @MaxLength(100)
  color?: string;
}

export class CreateProductDto {
  @ApiProperty({ example: 'Linen tablecloth', minLength: 2, maxLength: 120 })
  @Transform(trimInput)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({
    example: 'linen-tablecloth-120',
    maxLength: 120,
    description: 'Unique, lowercase latin letters and digits separated by single hyphens',
  })
  @Transform(trimInput)
  @IsString()
  @MaxLength(120)
  @Matches(SLUG_REGEX, { message: 'slug must be lowercase latin words separated by hyphens' })
  slug!: string;

  @ApiProperty({ example: 'Soft stonewashed linen for everyday use.', maxLength: 5000 })
  @Transform(trimInput)
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  description!: string;

  @ApiProperty({ enum: PRODUCT_CATEGORIES, example: 'textile' })
  @IsIn(PRODUCT_CATEGORIES)
  category!: ProductCategory;

  @ApiProperty({
    example: 129900,
    minimum: MIN_PRICE_CENTS,
    maximum: MAX_PRICE_CENTS,
    description: 'Integer in cents (kopiykas): 129900 means 1299.00',
  })
  @IsInt()
  @Min(MIN_PRICE_CENTS)
  @Max(MAX_PRICE_CENTS)
  priceCents!: number;

  @ApiPropertyOptional({ example: 25, default: 0, minimum: 0, maximum: MAX_PRODUCT_STOCK })
  @ValidateIf(isDefined)
  @IsInt()
  @Min(0)
  @Max(MAX_PRODUCT_STOCK)
  stock?: number;

  @ApiPropertyOptional({
    type: [String],
    maxItems: MAX_PRODUCT_IMAGES,
    example: ['https://images.example.com/tablecloth.jpg'],
    description: 'http/https URLs only; files are not uploaded',
  })
  @ValidateIf(isDefined)
  @IsArray()
  @ArrayMaxSize(MAX_PRODUCT_IMAGES)
  @IsString({ each: true })
  @MaxLength(2048, { each: true })
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true }, { each: true })
  images?: string[];

  @ApiPropertyOptional({ type: ProductAttributesDto })
  @ValidateIf(isDefined)
  @ValidateNested()
  @Type(() => ProductAttributesDto)
  attributes?: ProductAttributesDto;
}
