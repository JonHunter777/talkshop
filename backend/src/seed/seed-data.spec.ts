import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import mongoose from 'mongoose';
import {
  MAX_PRICE_CENTS,
  MAX_PRODUCT_IMAGES,
  MAX_PRODUCT_STOCK,
  PRODUCT_CATEGORIES,
} from '../common/constants/shop';
import { CreateProductDto } from '../products/dto/create-product.dto';
import { Product, ProductSchema } from '../products/schemas/product.schema';
import type { SeedProduct } from './run-seed';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CYRILLIC = /[Ѐ-ӿ]/;

const products = JSON.parse(
  readFileSync(join(__dirname, 'data', 'products.json'), 'utf8'),
) as SeedProduct[];

// Same options as the global ValidationPipe in app.setup.ts
const PIPE_OPTIONS = { whitelist: true, forbidNonWhitelisted: true } as const;

describe('seed data: products.json', () => {
  it('is an array with 30 to 50 products', () => {
    expect(Array.isArray(products)).toBe(true);
    expect(products.length).toBeGreaterThanOrEqual(30);
    expect(products.length).toBeLessThanOrEqual(50);
  });

  it.each(PRODUCT_CATEGORIES)('has exactly 7 products in the category %s', (category) => {
    expect(products.filter((p) => p.category === category)).toHaveLength(7);
  });

  it('has only known categories', () => {
    const unknown = products.filter((p) => !PRODUCT_CATEGORIES.includes(p.category));
    expect(unknown.map((p) => p.slug)).toEqual([]);
  });

  it('has unique slugs', () => {
    const slugs = products.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('has slugs in lowercase latin words separated by hyphens', () => {
    const bad = products.filter(
      (p) => !SLUG_PATTERN.test(p.slug) || p.slug !== p.slug.toLowerCase(),
    );
    expect(bad.map((p) => p.slug)).toEqual([]);
  });

  it('has integer prices between 1 and 100_000_000 cents', () => {
    const bad = products.filter(
      (p) => !Number.isInteger(p.priceCents) || p.priceCents < 1 || p.priceCents > MAX_PRICE_CENTS,
    );
    expect(bad.map((p) => p.slug)).toEqual([]);
  });

  it('has integer non-negative stock within the schema limit', () => {
    const bad = products.filter(
      (p) => !Number.isInteger(p.stock) || p.stock < 0 || p.stock > MAX_PRODUCT_STOCK,
    );
    expect(bad.map((p) => p.slug)).toEqual([]);
  });

  it('has products with low stock for the "almost sold out" scenarios', () => {
    const lowStocks = new Set(products.filter((p) => p.stock <= 5).map((p) => p.stock));
    for (const value of [0, 1, 2, 3, 5]) {
      expect(lowStocks.has(value)).toBe(true);
    }
  });

  it('has only https images, no more than the schema limit', () => {
    for (const product of products) {
      expect(product.images.length).toBeLessThanOrEqual(MAX_PRODUCT_IMAGES);
      for (const image of product.images) {
        expect(image.startsWith('https://')).toBe(true);
      }
    }
  });

  it('has Ukrainian (Cyrillic) text in name and description', () => {
    const bad = products.filter((p) => !CYRILLIC.test(p.name) || !CYRILLIC.test(p.description));
    expect(bad.map((p) => p.slug)).toEqual([]);
  });

  it('has no Cyrillic in slugs and image URLs', () => {
    const bad = products.filter(
      (p) => CYRILLIC.test(p.slug) || p.images.some((i) => CYRILLIC.test(i)),
    );
    expect(bad.map((p) => p.slug)).toEqual([]);
  });

  it('has the product slug in the text= parameter of every image URL', () => {
    const bad = products.filter((p) => p.images.some((i) => !i.includes(`text=${p.slug}`)));
    expect(bad.map((p) => p.slug)).toEqual([]);
  });

  describe('validation', () => {
    it('every product passes CreateProductDto (whitelist + forbidNonWhitelisted), including stock', async () => {
      const failures: string[] = [];
      for (const item of products) {
        const dto = plainToInstance(CreateProductDto, item);
        const errors = await validate(dto, PIPE_OPTIONS);
        if (errors.length > 0) {
          failures.push(`${item.slug}: ${errors.map((e) => e.property).join(', ')}`);
        }
      }
      expect(failures).toEqual([]);
    });

    it('every product passes the Product schema validation', () => {
      const ProductModel = mongoose.model(Product.name, ProductSchema);
      const failures: string[] = [];
      for (const item of products) {
        const error = new ProductModel(item).validateSync();
        if (error) {
          failures.push(`${item.slug}: ${Object.keys(error.errors).join(', ')}`);
        }
      }
      expect(failures).toEqual([]);
    });
  });
});
