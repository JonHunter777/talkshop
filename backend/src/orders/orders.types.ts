import type { Types } from 'mongoose';
import type { OrderStatus } from '../common/constants/shop';
import type { Order } from './schemas/order.schema';

// An order as returned by `.lean()` queries
export type OrderRecord = Order & { _id: Types.ObjectId };

export interface OrderItemView {
  productId: string;
  name: string;
  slug: string;
  priceCents: number;
  quantity: number;
}

// The shape of an order in API responses (id instead of _id, no __v, no userId)
export interface OrderView {
  id: string;
  orderNumber: string;
  items: OrderItemView[];
  totalCents: number;
  currency: string;
  status: OrderStatus;
  shipping: { fullName: string; phone: string; city: string; address: string };
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Why one cart line cannot be ordered (part of the 409 response)
export type StockProblemReason = 'not_found' | 'insufficient_stock';

export interface StockProblem {
  productId: string;
  reason: StockProblemReason;
  requested: number;
  // Stock at the moment of the check (0 if the product no longer exists)
  available: number;
}
