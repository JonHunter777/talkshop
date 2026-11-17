import { ApiProperty } from '@nestjs/swagger';

// Used only for Swagger: describes what the API returns
export class CartItemResponseDto {
  @ApiProperty({ example: '665f1c2e8a1b2c3d4e5f6a7b' })
  productId!: string;

  @ApiProperty({ example: 2 })
  quantity!: number;

  @ApiProperty({ description: 'false if the product was deleted' })
  available!: boolean;

  @ApiProperty({ description: 'true if quantity is greater than the current stock' })
  exceedsStock!: boolean;

  @ApiProperty({ type: String, nullable: true })
  name!: string | null;

  @ApiProperty({ type: String, nullable: true })
  slug!: string | null;

  @ApiProperty({ type: Number, nullable: true, description: 'Cents (kopiykas)' })
  priceCents!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  stock!: number | null;

  @ApiProperty({ type: String, nullable: true })
  image!: string | null;

  @ApiProperty({ example: 259800, description: 'priceCents * quantity; 0 if unavailable' })
  lineTotalCents!: number;
}

export class CartResponseDto {
  @ApiProperty({ type: [CartItemResponseDto] })
  items!: CartItemResponseDto[];

  @ApiProperty({
    example: 259800,
    description: 'Sum of available lines (lines with exceedsStock are included)',
  })
  totalCents!: number;

  @ApiProperty({ example: 'UAH' })
  currency!: string;

  @ApiProperty({
    description:
      'false if the cart is empty or has an unavailable line or a line with exceedsStock',
  })
  canCheckout!: boolean;
}
