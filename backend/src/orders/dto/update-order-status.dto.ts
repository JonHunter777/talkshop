import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { PATCHABLE_STATUSES, type PatchableStatus } from '../order-status';

// `cancelled` and `pending` are rejected here with 400: cancelling has its own route
// (POST /orders/:id/cancel, which also returns the stock), and no order goes back to pending.
export class UpdateOrderStatusDto {
  @ApiProperty({
    enum: PATCHABLE_STATUSES,
    example: 'processing',
    description:
      'The next status. Allowed: pending -> processing -> shipped -> delivered. ' +
      'To cancel an order use POST /orders/:id/cancel.',
  })
  @IsIn(PATCHABLE_STATUSES)
  status!: PatchableStatus;
}
