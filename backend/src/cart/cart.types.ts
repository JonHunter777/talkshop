import type { Types } from 'mongoose';

// A cart line as returned by `.lean()` queries
export interface CartItemRecord {
  productId: Types.ObjectId;
  quantity: number;
}

// One line of the cart in API responses. For a deleted product (available: false)
// the product fields are null and the line costs nothing.
export interface CartItemView {
  productId: string;
  quantity: number;
  available: boolean;
  // true if the quantity is greater than the current stock (stock may have dropped after adding)
  exceedsStock: boolean;
  name: string | null;
  slug: string | null;
  priceCents: number | null;
  stock: number | null;
  image: string | null;
  lineTotalCents: number;
}

export interface CartView {
  items: CartItemView[];
  // Sum of available lines, including lines with exceedsStock
  totalCents: number;
  currency: string;
  // false if the cart is empty or has an unavailable line or a line with exceedsStock
  canCheckout: boolean;
}
