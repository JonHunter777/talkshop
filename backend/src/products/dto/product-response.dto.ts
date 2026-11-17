import { ApiProperty } from '@nestjs/swagger';
import { PRODUCT_CATEGORIES, type ProductCategory } from '../../common/constants/shop';
import { ProductAttributesDto } from './create-product.dto';

// Used only for Swagger: describes what the API returns
export class ProductResponseDto {
  @ApiProperty({ example: '665f1c2e8a1b2c3d4e5f6a7b' })
  id!: string;

  @ApiProperty({ example: 'Linen tablecloth' })
  name!: string;

  @ApiProperty({ example: 'linen-tablecloth-120' })
  slug!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty({ enum: PRODUCT_CATEGORIES })
  category!: ProductCategory;

  @ApiProperty({ example: 129900, description: 'Integer in cents (kopiykas)' })
  priceCents!: number;

  @ApiProperty({ example: 25 })
  stock!: number;

  @ApiProperty({ type: [String] })
  images!: string[];

  @ApiProperty({ type: ProductAttributesDto })
  attributes!: ProductAttributesDto;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class PaginatedProductsDto {
  @ApiProperty({ type: [ProductResponseDto] })
  items!: ProductResponseDto[];

  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;
}
