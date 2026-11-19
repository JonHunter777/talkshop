import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { ORDER_STATUSES, type OrderStatus } from '../../common/constants/shop';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

// Query of GET /orders/all. Query values are always strings, so `IsOptional` is fine here:
// an object or an array (`?status[$ne]=x`) fails IsIn and gives 400.
export class AdminOrderQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ORDER_STATUSES, description: 'Show only orders in this status' })
  @IsOptional()
  @IsIn(ORDER_STATUSES)
  status?: OrderStatus;
}
