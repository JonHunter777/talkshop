import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import {
  MAX_PRICE_CENTS,
  MAX_SEARCH_QUERY_LENGTH,
  PRODUCT_CATEGORIES,
  PRODUCT_SORTS,
  type ProductCategory,
  type ProductSort,
} from '../../common/constants/shop';
import { trimInput } from '../../common/utils/trim-input';

export class ProductQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: PRODUCT_CATEGORIES })
  @IsOptional()
  @IsIn(PRODUCT_CATEGORIES)
  category?: ProductCategory;

  @ApiPropertyOptional({ example: 10000, minimum: 0, description: 'Inclusive, in cents' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_PRICE_CENTS)
  minPriceCents?: number;

  @ApiPropertyOptional({ example: 500000, minimum: 0, description: 'Inclusive, in cents' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_PRICE_CENTS)
  maxPriceCents?: number;

  @ApiPropertyOptional({
    example: 'linen',
    maxLength: MAX_SEARCH_QUERY_LENGTH,
    description: 'Text search by whole words (name, material, color, description)',
  })
  @IsOptional()
  @Transform(trimInput)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_SEARCH_QUERY_LENGTH)
  q?: string;

  @ApiPropertyOptional({
    enum: PRODUCT_SORTS,
    default: 'newest',
    description: '`relevance` works only together with `q`',
  })
  @IsOptional()
  @IsIn(PRODUCT_SORTS)
  sort: ProductSort = 'newest';
}
