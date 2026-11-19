import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ORDER_STATUSES, type OrderStatus } from '../../common/constants/shop';

// Used only for Swagger: describes what the API returns
export class OrderItemResponseDto {
  @ApiProperty({ example: '665f1c2e8a1b2c3d4e5f6a7b' })
  productId!: string;

  @ApiProperty({ example: 'Linen tablecloth', description: 'Name at the time of purchase' })
  name!: string;

  @ApiProperty({ example: 'linen-tablecloth' })
  slug!: string;

  @ApiProperty({ example: 129900, description: 'Price at the time of purchase, in cents' })
  priceCents!: number;

  @ApiProperty({ example: 2 })
  quantity!: number;
}

export class OrderShippingResponseDto {
  @ApiProperty()
  fullName!: string;

  @ApiProperty()
  phone!: string;

  @ApiProperty()
  city!: string;

  @ApiProperty()
  address!: string;
}

export class OrderResponseDto {
  @ApiProperty({ example: '665f1c2e8a1b2c3d4e5f6a7b' })
  id!: string;

  @ApiProperty({ example: 'TS-261119-K7M2QX' })
  orderNumber!: string;

  @ApiProperty({ type: [OrderItemResponseDto] })
  items!: OrderItemResponseDto[];

  @ApiProperty({ example: 259800, description: 'Calculated on the server, in cents' })
  totalCents!: number;

  @ApiProperty({ example: 'UAH' })
  currency!: string;

  @ApiProperty({ enum: ORDER_STATUSES })
  status!: OrderStatus;

  @ApiProperty({ type: OrderShippingResponseDto })
  shipping!: OrderShippingResponseDto;

  @ApiPropertyOptional()
  note?: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class PaginatedOrdersDto {
  @ApiProperty({ type: [OrderResponseDto] })
  items!: OrderResponseDto[];

  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;
}

export class StockProblemDto {
  @ApiProperty({ example: '665f1c2e8a1b2c3d4e5f6a7b' })
  productId!: string;

  @ApiProperty({ enum: ['not_found', 'insufficient_stock'] })
  reason!: 'not_found' | 'insufficient_stock';

  @ApiProperty({ example: 3 })
  requested!: number;

  @ApiProperty({ example: 1, description: 'Stock at the moment of the check (0 if deleted)' })
  available!: number;
}

export class CheckoutConflictDto {
  @ApiProperty({ example: 409 })
  statusCode!: number;

  @ApiProperty({ example: 'Some items in the cart cannot be ordered' })
  message!: string;

  @ApiProperty({ type: [StockProblemDto], description: 'ALL problem lines, not only the first' })
  items!: StockProblemDto[];
}
