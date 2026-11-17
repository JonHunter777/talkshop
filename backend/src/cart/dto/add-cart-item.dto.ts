import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsMongoId, Max, Min } from 'class-validator';
import { MAX_ITEM_QUANTITY, MIN_ITEM_QUANTITY } from '../../common/constants/shop';

// No `userId` field on purpose: the user comes only from the JWT.
// With forbidNonWhitelisted an extra field gives 400.
export class AddCartItemDto {
  @ApiProperty({ example: '665f1c2e8a1b2c3d4e5f6a7b' })
  @IsMongoId()
  productId!: string;

  @ApiProperty({
    example: 2,
    minimum: MIN_ITEM_QUANTITY,
    maximum: MAX_ITEM_QUANTITY,
    description: 'How many to ADD to the quantity that is already in the cart',
  })
  @IsInt()
  @Min(MIN_ITEM_QUANTITY)
  @Max(MAX_ITEM_QUANTITY)
  quantity!: number;
}
