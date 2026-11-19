import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, FilterQuery, Model, SortOrder } from 'mongoose';
import { buildPaginated, getSkip, Paginated } from '../common/dto/paginated-response';
import { ProductSort } from '../common/constants/shop';
import { isDuplicateKeyError } from '../common/utils/mongo-errors';
import { isObjectIdString } from '../common/utils/object-id';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductRecord, ProductView } from './products.types';
import { Product } from './schemas/product.schema';

// Maps a lean record to the shape that is returned by the API
export function toProductView(product: ProductRecord): ProductView {
  return {
    id: product._id.toString(),
    name: product.name,
    slug: product.slug,
    description: product.description,
    category: product.category,
    priceCents: product.priceCents,
    stock: product.stock,
    images: product.images,
    attributes: {
      material: product.attributes?.material,
      size: product.attributes?.size,
      color: product.attributes?.color,
    },
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

const TEXT_SCORE = { $meta: 'textScore' } as const;

// _id is only a tie-breaker for stable pagination; its direction does not matter.
const SORTS: Record<Exclude<ProductSort, 'relevance'>, Record<string, SortOrder>> = {
  newest: { createdAt: -1, _id: -1 },
  price_asc: { priceCents: 1, _id: 1 },
  price_desc: { priceCents: -1, _id: 1 },
};

// DTO instances may carry `undefined` for fields that were not sent: drop them,
// so an update never overwrites a field with nothing.
function withoutUndefined<T extends object>(data: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

@Injectable()
export class ProductsService {
  constructor(@InjectModel(Product.name) private readonly productModel: Model<Product>) {}

  async create(dto: CreateProductDto): Promise<ProductView> {
    try {
      const created = await this.productModel.create(withoutUndefined(dto));
      return toProductView(created.toObject());
    } catch (error) {
      // The unique index is the real protection against two admins using the same slug
      if (isDuplicateKeyError(error)) {
        throw new ConflictException('Product with this slug already exists');
      }
      throw error;
    }
  }

  async findAll(query: ProductQueryDto): Promise<Paginated<ProductView>> {
    const { page, limit, category, minPriceCents, maxPriceCents, q, sort } = query;

    if (
      minPriceCents !== undefined &&
      maxPriceCents !== undefined &&
      minPriceCents > maxPriceCents
    ) {
      throw new BadRequestException('minPriceCents must not be greater than maxPriceCents');
    }
    if (sort === 'relevance' && q === undefined) {
      throw new BadRequestException('sort=relevance requires the q parameter');
    }

    const filter: FilterQuery<Product> = {};
    if (category) {
      filter.category = category;
    }
    if (minPriceCents !== undefined || maxPriceCents !== undefined) {
      filter.priceCents = {
        ...(minPriceCents !== undefined && { $gte: minPriceCents }),
        ...(maxPriceCents !== undefined && { $lte: maxPriceCents }),
      };
    }
    if (q !== undefined) {
      // $search is always a string here (validated by the DTO), so it cannot carry operators
      filter.$text = { $search: q };
    }

    const sortSpec: Record<string, SortOrder | { $meta: 'textScore' }> =
      sort === 'relevance' ? { score: TEXT_SCORE, _id: 1 } : SORTS[sort];
    // The text score is only available if it is requested in the projection
    const projection = q !== undefined ? { score: TEXT_SCORE } : undefined;

    const [records, total] = await Promise.all([
      this.productModel
        .find(filter, projection)
        .sort(sortSpec)
        .skip(getSkip(page, limit))
        .limit(limit)
        .lean<ProductRecord[]>()
        .exec(),
      this.productModel.countDocuments(filter).exec(),
    ]);

    return buildPaginated(records.map(toProductView), total, { page, limit });
  }

  async findById(id: string): Promise<ProductView> {
    const record = isObjectIdString(id)
      ? await this.productModel.findById(id).lean<ProductRecord>().exec()
      : null;
    if (!record) {
      throw new NotFoundException('Product not found');
    }
    return toProductView(record);
  }

  async findBySlug(slug: string): Promise<ProductView> {
    const record = await this.productModel.findOne({ slug }).lean<ProductRecord>().exec();
    if (!record) {
      throw new NotFoundException('Product not found');
    }
    return toProductView(record);
  }

  async update(id: string, dto: UpdateProductDto): Promise<ProductView> {
    const changes = withoutUndefined(dto);
    if (Object.keys(changes).length === 0) {
      throw new BadRequestException('Nothing to update');
    }
    try {
      const record = await this.productModel
        .findByIdAndUpdate(id, { $set: changes }, { new: true, runValidators: true })
        .lean<ProductRecord>()
        .exec();
      if (!record) {
        throw new NotFoundException('Product not found');
      }
      return toProductView(record);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictException('Product with this slug already exists');
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    const deleted = await this.productModel.findByIdAndDelete(id).lean().exec();
    if (!deleted) {
      throw new NotFoundException('Product not found');
    }
  }

  // --- Methods for other modules (cart, orders). They return raw records, not API views. ---

  // Missing and malformed ids are skipped: the caller compares what it asked for with what came back.
  // Inside a transaction (checkout) pass the session, so the read sees the same snapshot as the
  // writes of that transaction.
  async findManyByIds(ids: string[], session?: ClientSession): Promise<ProductRecord[]> {
    const validIds = [...new Set(ids.filter(isObjectIdString))];
    if (validIds.length === 0) {
      return [];
    }
    return this.productModel
      .find({ _id: { $in: validIds } })
      .session(session ?? null)
      .lean<ProductRecord[]>()
      .exec();
  }

  // Atomic: the condition `stock >= quantity` and the decrement are one DB operation,
  // so two parallel orders can never push the stock below zero.
  // Returns false if the product does not exist or there is not enough stock.
  // Inside a transaction the caller MUST pass the session, or this update escapes the rollback.
  async decrementStock(
    productId: string,
    quantity: number,
    session?: ClientSession,
  ): Promise<boolean> {
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new BadRequestException('quantity must be a positive integer');
    }
    if (!isObjectIdString(productId)) {
      return false;
    }
    const result = await this.productModel
      .updateOne(
        { _id: productId, stock: { $gte: quantity } },
        { $inc: { stock: -quantity } },
        { session },
      )
      .exec();
    return result.modifiedCount === 1;
  }
}
