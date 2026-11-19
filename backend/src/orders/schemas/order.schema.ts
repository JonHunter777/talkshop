import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import {
  CURRENCY,
  MAX_ITEM_QUANTITY,
  MIN_ITEM_QUANTITY,
  ORDER_STATUSES,
  type OrderStatus,
} from '../../common/constants/shop';

// A snapshot of the product at the moment of purchase. It never changes afterwards: a later
// price change, rename or deletion of the product does not touch old orders.
@Schema({ _id: false })
export class OrderItem {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  productId!: Types.ObjectId;

  @Prop({ type: String, required: true })
  name!: string;

  @Prop({ type: String, required: true })
  slug!: string;

  // Integer in cents (kopiykas)
  @Prop({ type: Number, required: true, min: 1 })
  priceCents!: number;

  @Prop({ type: Number, required: true, min: MIN_ITEM_QUANTITY, max: MAX_ITEM_QUANTITY })
  quantity!: number;
}

const OrderItemSchema = SchemaFactory.createForClass(OrderItem);

@Schema({ _id: false })
export class OrderShipping {
  @Prop({ type: String, required: true, trim: true, maxlength: 100 })
  fullName!: string;

  @Prop({ type: String, required: true, trim: true, maxlength: 20 })
  phone!: string;

  @Prop({ type: String, required: true, trim: true, maxlength: 100 })
  city!: string;

  @Prop({ type: String, required: true, trim: true, maxlength: 200 })
  address!: string;
}

const OrderShippingSchema = SchemaFactory.createForClass(OrderShipping);

@Schema({ timestamps: true })
export class Order {
  @Prop({ type: String, required: true })
  orderNumber!: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  userId!: Types.ObjectId;

  @Prop({ type: [OrderItemSchema], required: true })
  items!: OrderItem[];

  // Calculated only on the server, from the prices read inside the checkout transaction
  @Prop({ type: Number, required: true, min: 1 })
  totalCents!: number;

  @Prop({ type: String, required: true, default: CURRENCY })
  currency!: string;

  @Prop({ type: String, enum: ORDER_STATUSES, required: true, default: 'pending' })
  status!: OrderStatus;

  @Prop({ type: OrderShippingSchema, required: true })
  shipping!: OrderShipping;

  @Prop({ type: String, trim: true, maxlength: 500 })
  note?: string;

  // Managed by `timestamps: true`; declared only so TypeScript knows about them.
  createdAt!: Date;
  updatedAt!: Date;
}

export type OrderDocument = HydratedDocument<Order>;

export const OrderSchema = SchemaFactory.createForClass(Order);

// Serves: uniqueness of the human-readable number. This is the only unique index of the
// collection, so an E11000 on insert always means "this order number is taken".
OrderSchema.index({ orderNumber: 1 }, { unique: true });

// Serves: "my orders, newest first" (GET /orders) and the ownership check by userId.
// `_id` is part of the index because the query sorts by { createdAt: -1, _id: -1 }
// (_id is the tie-breaker for stable pagination). A sort field that is missing from the index
// forces an in-memory sort. Order of fields: equality (userId), then the sort fields.
OrderSchema.index({ userId: 1, createdAt: -1, _id: -1 });

// Serves: the admin list filtered by status, newest first (step 8).
OrderSchema.index({ status: 1, createdAt: -1 });
