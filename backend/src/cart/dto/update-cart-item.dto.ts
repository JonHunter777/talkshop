import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';
import { MAX_ITEM_QUANTITY, MIN_ITEM_QUANTITY } from '../../common/constants/shop';

export class UpdateCartItemDto {
  @ApiProperty({
    example: 3,
    minimum: MIN_ITEM_QUANTITY,
    maximum: MAX_ITEM_QUANTITY,
    description: 'The NEW quantity of the line (not an increment)',
  })
  @IsInt()
  @Min(MIN_ITEM_QUANTITY)
  @Max(MAX_ITEM_QUANTITY)
  quantity!: number;
}
