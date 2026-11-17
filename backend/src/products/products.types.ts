import type { Types } from 'mongoose';
import type { Product } from './schemas/product.schema';

// A product as returned by `.lean()` queries (plain object, no document methods)
export type ProductRecord = Product & { _id: Types.ObjectId };

// The shape of a product in API responses (id instead of _id, no __v)
export interface ProductView {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: Product['category'];
  priceCents: number;
  stock: number;
  images: string[];
  attributes: { material?: string; size?: string; color?: string };
  createdAt: Date;
  updatedAt: Date;
}
