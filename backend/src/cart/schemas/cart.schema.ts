import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { MAX_ITEM_QUANTITY, MIN_ITEM_QUANTITY } from '../../common/constants/shop';

// A cart line stores only the product reference and the quantity.
// Name and price are always read from the product, so a cart never shows stale prices.
@Schema({ _id: false })
export class CartItem {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  productId!: Types.ObjectId;

  @Prop({
    type: Number,
    required: true,
    min: MIN_ITEM_QUANTITY,
    max: MAX_ITEM_QUANTITY,
    validate: { validator: Number.isInteger, message: 'quantity must be an integer' },
  })
  quantity!: number;
}

const CartItemSchema = SchemaFactory.createForClass(CartItem);

// Note: the limit of 50 lines and the 1..99 range are enforced by the conditions of the atomic
// updates in CartService, not here: schema validators do not run on updateOne().
@Schema({ timestamps: true })
export class Cart {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  userId!: Types.ObjectId;

  @Prop({ type: [CartItemSchema], default: [] })
  items!: CartItem[];

  // Managed by `timestamps: true`; declared only so TypeScript knows about them.
  createdAt!: Date;
  updatedAt!: Date;
}

export type CartDocument = HydratedDocument<Cart>;

export const CartSchema = SchemaFactory.createForClass(Cart);

// Serves: every cart lookup ({ userId }) and guarantees one cart per user.
// Two parallel "create cart" requests cannot both succeed: the second gets E11000.
CartSchema.index({ userId: 1 }, { unique: true });
