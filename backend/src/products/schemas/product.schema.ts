import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  MAX_PRICE_CENTS,
  MAX_PRODUCT_STOCK,
  MIN_PRICE_CENTS,
  PRODUCT_CATEGORIES,
  type ProductCategory,
} from '../../common/constants/shop';

@Schema({ _id: false })
export class ProductAttributes {
  @Prop({ type: String, trim: true, maxlength: 100 })
  material?: string;

  @Prop({ type: String, trim: true, maxlength: 100 })
  size?: string;

  @Prop({ type: String, trim: true, maxlength: 100 })
  color?: string;
}

const ProductAttributesSchema = SchemaFactory.createForClass(ProductAttributes);

@Schema({ timestamps: true })
export class Product {
  @Prop({ type: String, required: true, trim: true, minlength: 2, maxlength: 120 })
  name!: string;

  // Set by the admin (no auto-generation); uniqueness is enforced by the index below
  @Prop({ type: String, required: true, trim: true, lowercase: true, maxlength: 120 })
  slug!: string;

  @Prop({ type: String, required: true, trim: true, maxlength: 5000 })
  description!: string;

  @Prop({ type: String, enum: PRODUCT_CATEGORIES, required: true })
  category!: ProductCategory;

  // Integer in "cents" (kopiykas), never a float
  @Prop({
    type: Number,
    required: true,
    min: MIN_PRICE_CENTS,
    max: MAX_PRICE_CENTS,
    validate: { validator: Number.isInteger, message: 'priceCents must be an integer' },
  })
  priceCents!: number;

  @Prop({
    type: Number,
    required: true,
    default: 0,
    min: 0,
    max: MAX_PRODUCT_STOCK,
    validate: { validator: Number.isInteger, message: 'stock must be an integer' },
  })
  stock!: number;

  @Prop({ type: [String], default: [] })
  images!: string[];

  @Prop({ type: ProductAttributesSchema, default: () => ({}) })
  attributes!: ProductAttributes;

  // Managed by `timestamps: true`; declared only so TypeScript knows about them.
  createdAt!: Date;
  updatedAt!: Date;
}

export type ProductDocument = HydratedDocument<Product>;

export const ProductSchema = SchemaFactory.createForClass(Product);

// Serves: GET /products/slug/:slug and duplicate-slug protection (atomic in the DB).
ProductSchema.index({ slug: 1 }, { unique: true });

// Serves: category filter + price range / price sorting.
ProductSchema.index({ category: 1, priceCents: 1 });

// Serves: category filter + "newest first" sorting.
ProductSchema.index({ category: 1, createdAt: -1 });

// Serves: "all products, newest first" (no category filter) - the two indexes above
// start with `category`, so they cannot be used for this query.
ProductSchema.index({ createdAt: -1 });

// Serves: text search (q). Name matters most. `default_language: 'none'` turns off stemming:
// search works on whole words only ("килим" will not find "килими") - a known limitation.
ProductSchema.index(
  {
    name: 'text',
    'attributes.material': 'text',
    'attributes.color': 'text',
    description: 'text',
  },
  {
    name: 'product_text',
    weights: { name: 10, 'attributes.material': 3, 'attributes.color': 3, description: 1 },
    default_language: 'none',
  },
);
