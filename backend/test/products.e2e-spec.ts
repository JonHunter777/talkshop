import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Model, Types } from 'mongoose';
import request from 'supertest';
import { App } from 'supertest/types';
import { ProductsService } from '../src/products/products.service';
import { Product } from '../src/products/schemas/product.schema';
import { createAdmin } from './helpers/create-admin';
import { createTestApp } from './helpers/create-test-app';
import { dropTestDb } from './helpers/test-db';

interface ProductBody {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  priceCents: number;
  stock: number;
  images: string[];
  attributes: { material?: string; size?: string; color?: string };
}

interface ListBody {
  items: ProductBody[];
  total: number;
  page: number;
  limit: number;
}

const validProduct = {
  name: 'Linen tablecloth',
  slug: 'linen-tablecloth',
  description: 'Soft stonewashed fabric for everyday use.',
  category: 'textile',
  priceCents: 129900,
  stock: 10,
};

describe('Products API (e2e, in-memory MongoDB)', () => {
  let app: INestApplication<App>;
  let productModel: Model<Product>;
  let productsService: ProductsService;
  let adminToken: string;
  let customerToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    productModel = app.get<Model<Product>>(getModelToken(Product.name));
    productsService = app.get(ProductsService);
    const jwt = app.get(JwtService);
    // The admin must exist in the database: admin routes check the current role there
    adminToken = (await createAdmin(app)).token;
    customerToken = jwt.sign({ sub: new Types.ObjectId().toString(), role: 'customer' });
  });

  afterAll(async () => {
    await dropTestDb(app);
    await app.close();
  });

  beforeEach(async () => {
    await productModel.deleteMany({});
  });

  const seed = (overrides: Record<string, unknown>) =>
    productModel.create({ ...validProduct, ...overrides });

  const list = async (query: string): Promise<ListBody> => {
    const res = await request(app.getHttpServer()).get(`/api/products${query}`).expect(200);
    return res.body as ListBody;
  };

  describe('POST /api/products', () => {
    const post = (body: object, token?: string) => {
      const req = request(app.getHttpServer()).post('/api/products');
      return (token ? req.set('Authorization', `Bearer ${token}`) : req).send(body);
    };

    it('creates a product as admin and returns id instead of _id', async () => {
      const res = await post(validProduct, adminToken).expect(201);
      const body = res.body as ProductBody & { _id?: string; __v?: number };

      expect(body).toMatchObject({ ...validProduct, images: [], attributes: {} });
      expect(body.id).toMatch(/^[0-9a-f]{24}$/);
      expect(body._id).toBeUndefined();
      expect(body.__v).toBeUndefined();
    });

    it('defaults stock to 0', async () => {
      const withoutStock = { ...validProduct, stock: undefined };

      const res = await post(withoutStock, adminToken).expect(201);

      expect((res.body as ProductBody).stock).toBe(0);
    });

    it('returns 401 without a token', async () => {
      await post(validProduct).expect(401);
    });

    it('returns 403 for a customer', async () => {
      await post(validProduct, customerToken).expect(403);
    });

    it('returns 409 for a duplicate slug (enforced by the DB index)', async () => {
      await post(validProduct, adminToken).expect(201);

      await post(validProduct, adminToken).expect(409);
    });

    it('allows only one of two parallel creates with the same slug', async () => {
      const results = await Promise.all([
        post(validProduct, adminToken),
        post(validProduct, adminToken),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(await productModel.countDocuments({ slug: validProduct.slug })).toBe(1);
    });

    it.each([
      ['null stock', { stock: null }],
      ['null images', { images: null }],
      ['null attributes', { attributes: null }],
      ['null attribute field', { attributes: { color: null } }],
      ['fractional price', { priceCents: 10.5 }],
      ['zero price', { priceCents: 0 }],
      ['negative stock', { stock: -1 }],
      ['unknown category', { category: 'toys' }],
      ['invalid slug', { slug: 'Not A Slug' }],
      ['invalid image url', { images: ['javascript:alert(1)'] }],
      ['unknown field', { role: 'admin' }],
    ])('returns 400 for %s', async (_name, override) => {
      await post({ ...validProduct, ...override }, adminToken).expect(400);
    });
  });

  describe('GET /api/products/:id and /slug/:slug', () => {
    it('returns a product by id and by slug without a token', async () => {
      const created = await seed({});

      const byId = await request(app.getHttpServer())
        .get(`/api/products/${created.id as string}`)
        .expect(200);
      const bySlug = await request(app.getHttpServer())
        .get(`/api/products/slug/${validProduct.slug}`)
        .expect(200);

      expect(byId.body).toMatchObject({ id: created.id as string, slug: validProduct.slug });
      expect(bySlug.body).toEqual(byId.body);
    });

    it('returns 400 for a malformed id and 404 for an unknown one', async () => {
      await request(app.getHttpServer()).get('/api/products/123').expect(400);
      await request(app.getHttpServer())
        .get(`/api/products/${new Types.ObjectId().toString()}`)
        .expect(404);
    });

    it('returns 404 for an unknown slug', async () => {
      await request(app.getHttpServer()).get('/api/products/slug/nope').expect(404);
    });
  });

  describe('GET /api/products (list)', () => {
    it('uses the pagination defaults', async () => {
      await seed({});

      const body = await list('');

      expect(body).toMatchObject({ total: 1, page: 1, limit: 20 });
      expect(body.items).toHaveLength(1);
    });

    it('paginates without repeating or skipping items', async () => {
      for (let i = 1; i <= 5; i++) {
        // equal prices on purpose: the order must still be stable between pages
        await seed({ name: `Item ${i}`, slug: `item-${i}`, priceCents: 1000 });
      }

      const first = await list('?limit=2&page=1&sort=price_asc');
      const second = await list('?limit=2&page=2&sort=price_asc');
      const third = await list('?limit=2&page=3&sort=price_asc');

      const ids = [...first.items, ...second.items, ...third.items].map((p) => p.id);
      expect(new Set(ids).size).toBe(5);
      expect(first.total).toBe(5);
      expect(third.items).toHaveLength(1);
    });

    it('returns 400 for limit=51 and page=0', async () => {
      await request(app.getHttpServer()).get('/api/products?limit=51').expect(400);
      await request(app.getHttpServer()).get('/api/products?page=0').expect(400);
    });

    it('filters by category and rejects an unknown one', async () => {
      await seed({ slug: 'a', category: 'kitchen' });
      await seed({ slug: 'b', category: 'decor' });

      const body = await list('?category=kitchen');

      expect(body.items.map((p) => p.slug)).toEqual(['a']);
      await request(app.getHttpServer()).get('/api/products?category=toys').expect(400);
    });

    it('treats price bounds as inclusive', async () => {
      await seed({ slug: 'p1', priceCents: 1000 });
      await seed({ slug: 'p2', priceCents: 2000 });
      await seed({ slug: 'p3', priceCents: 3000 });

      const body = await list('?minPriceCents=1000&maxPriceCents=2000&sort=price_asc');

      expect(body.items.map((p) => p.slug)).toEqual(['p1', 'p2']);
    });

    it('returns 400 when minPriceCents is greater than maxPriceCents', async () => {
      await request(app.getHttpServer())
        .get('/api/products?minPriceCents=5000&maxPriceCents=1000')
        .expect(400);
    });

    it('sorts by price in both directions and by newest first', async () => {
      await seed({ slug: 'cheap', priceCents: 1000 });
      await seed({ slug: 'mid', priceCents: 2000 });
      await seed({ slug: 'dear', priceCents: 3000 });

      const asc = await list('?sort=price_asc');
      const desc = await list('?sort=price_desc');
      const newest = await list('?sort=newest');

      expect(asc.items.map((p) => p.slug)).toEqual(['cheap', 'mid', 'dear']);
      expect(desc.items.map((p) => p.slug)).toEqual(['dear', 'mid', 'cheap']);
      expect(newest.items.map((p) => p.slug)).toEqual(['dear', 'mid', 'cheap']);
    });

    it('returns 400 for sort=relevance without q', async () => {
      await request(app.getHttpServer()).get('/api/products?sort=relevance').expect(400);
    });

    describe('text search (q)', () => {
      it('finds by name, material and color, ignoring case', async () => {
        await seed({ slug: 'by-name', name: 'Wooden spoon', description: 'Kitchen tool.' });
        await seed({
          slug: 'by-material',
          name: 'Bowl',
          description: 'Round.',
          attributes: { material: 'ceramic' },
        });
        await seed({
          slug: 'by-color',
          name: 'Vase',
          description: 'Tall.',
          attributes: { color: 'turquoise' },
        });

        expect((await list('?q=WOODEN')).items.map((p) => p.slug)).toEqual(['by-name']);
        expect((await list('?q=ceramic')).items.map((p) => p.slug)).toEqual(['by-material']);
        expect((await list('?q=Turquoise')).items.map((p) => p.slug)).toEqual(['by-color']);
      });

      it('ranks a name match above a description match with sort=relevance', async () => {
        await seed({ slug: 'in-description', name: 'Towel', description: 'Made of pure linen.' });
        await seed({ slug: 'in-name', name: 'Linen towel', description: 'Soft and light.' });

        const body = await list('?q=linen&sort=relevance');

        expect(body.items.map((p) => p.slug)).toEqual(['in-name', 'in-description']);
      });

      it('combines search with filters and counts only matches', async () => {
        await seed({ slug: 'a', name: 'Linen towel', category: 'textile' });
        await seed({ slug: 'b', name: 'Linen lamp shade', category: 'lighting' });

        const body = await list('?q=linen&category=lighting');

        expect(body.total).toBe(1);
        expect(body.items.map((p) => p.slug)).toEqual(['b']);
      });

      it('does not match part of a word (no stemming, known limitation)', async () => {
        await seed({ slug: 'a', name: 'Tablecloths set' });

        expect((await list('?q=tablecloth')).total).toBe(0);
      });

      it('returns 400 for a q longer than 100 characters', async () => {
        await request(app.getHttpServer())
          .get(`/api/products?q=${'a'.repeat(101)}`)
          .expect(400);
      });

      it('does not let q carry query operators', async () => {
        await seed({});

        await request(app.getHttpServer()).get('/api/products?q[$ne]=x').expect(400);
        await request(app.getHttpServer()).get('/api/products?category[$ne]=kitchen').expect(400);
      });
    });
  });

  describe('PATCH /api/products/:id', () => {
    const patch = (id: string, body: object, token?: string) => {
      const req = request(app.getHttpServer()).patch(`/api/products/${id}`);
      return (token ? req.set('Authorization', `Bearer ${token}`) : req).send(body);
    };

    it('updates only the given fields', async () => {
      const created = await seed({});

      const res = await patch(created.id as string, { priceCents: 5000 }, adminToken).expect(200);

      expect(res.body).toMatchObject({ ...validProduct, priceCents: 5000 });
    });

    it('replaces the whole attributes object', async () => {
      const created = await seed({ attributes: { material: 'linen', color: 'beige' } });

      const res = await patch(
        created.id as string,
        { attributes: { size: '120x180' } },
        adminToken,
      ).expect(200);

      expect((res.body as ProductBody).attributes).toEqual({ size: '120x180' });
    });

    it.each([
      ['description', { description: null }],
      ['images', { images: null }],
      ['attributes', { attributes: null }],
      ['stock', { stock: null }],
    ])('returns 400 (not 500) for null %s', async (_name, body) => {
      const created = await seed({});

      await patch(created.id as string, body, adminToken).expect(400);
      expect((await productModel.findById(created.id as string))?.description).toBe(
        validProduct.description,
      );
    });

    it('clears images with an empty array', async () => {
      const created = await seed({ images: ['https://images.example.com/a.jpg'] });

      const res = await patch(created.id as string, { images: [] }, adminToken).expect(200);

      expect((res.body as ProductBody).images).toEqual([]);
    });

    it('returns 401 without a token and 403 for a customer', async () => {
      const created = await seed({});

      await patch(created.id as string, { priceCents: 5000 }).expect(401);
      await patch(created.id as string, { priceCents: 5000 }, customerToken).expect(403);
    });

    it('returns 400 for an empty body, an invalid value or a malformed id', async () => {
      const created = await seed({});

      await patch(created.id as string, {}, adminToken).expect(400);
      await patch(created.id as string, { priceCents: 0 }, adminToken).expect(400);
      await patch('123', { priceCents: 5000 }, adminToken).expect(400);
    });

    it('returns 404 for an unknown product', async () => {
      await patch(new Types.ObjectId().toString(), { priceCents: 5000 }, adminToken).expect(404);
    });

    it('returns 409 when the new slug is taken', async () => {
      await seed({ slug: 'taken' });
      const other = await seed({ slug: 'other' });

      await patch(other.id as string, { slug: 'taken' }, adminToken).expect(409);
    });
  });

  describe('DELETE /api/products/:id', () => {
    it('deletes a product as admin (204) and then it is gone (404)', async () => {
      const created = await seed({});
      const url = `/api/products/${created.id as string}`;

      await request(app.getHttpServer())
        .delete(url)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);
      await request(app.getHttpServer()).get(url).expect(404);
    });

    it('returns 401 without a token, 403 for a customer, 404 for an unknown id', async () => {
      const created = await seed({});
      const url = `/api/products/${created.id as string}`;

      await request(app.getHttpServer()).delete(url).expect(401);
      await request(app.getHttpServer())
        .delete(url)
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .delete(`/api/products/${new Types.ObjectId().toString()}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
      expect(await productModel.countDocuments()).toBe(1);
    });
  });

  describe('ProductsService methods for other modules', () => {
    it('findManyByIds returns existing products and skips unknown and malformed ids', async () => {
      const a = await seed({ slug: 'a' });
      await seed({ slug: 'b' });

      const found = await productsService.findManyByIds([
        a.id as string,
        a.id as string,
        new Types.ObjectId().toString(),
        'not-an-id',
      ]);

      expect(found.map((p) => p.slug)).toEqual(['a']);
      expect(await productsService.findManyByIds([])).toEqual([]);
    });

    it('decrementStock decreases the stock and returns true', async () => {
      const p = await seed({ stock: 5 });

      expect(await productsService.decrementStock(p.id as string, 3)).toBe(true);

      expect((await productModel.findById(p.id as string))?.stock).toBe(2);
    });

    it('decrementStock allows taking exactly the whole stock', async () => {
      const p = await seed({ stock: 3 });

      expect(await productsService.decrementStock(p.id as string, 3)).toBe(true);

      expect((await productModel.findById(p.id as string))?.stock).toBe(0);
    });

    it('decrementStock returns false and changes nothing when stock is not enough', async () => {
      const p = await seed({ stock: 2 });

      expect(await productsService.decrementStock(p.id as string, 3)).toBe(false);

      expect((await productModel.findById(p.id as string))?.stock).toBe(2);
    });

    it('decrementStock returns false for an unknown or malformed product id', async () => {
      expect(await productsService.decrementStock(new Types.ObjectId().toString(), 1)).toBe(false);
      expect(await productsService.decrementStock('nope', 1)).toBe(false);
    });

    it('decrementStock rejects a non-positive or fractional quantity', async () => {
      const p = await seed({ stock: 5 });

      await expect(productsService.decrementStock(p.id as string, 0)).rejects.toThrow();
      await expect(productsService.decrementStock(p.id as string, -1)).rejects.toThrow();
      await expect(productsService.decrementStock(p.id as string, 1.5)).rejects.toThrow();
      expect((await productModel.findById(p.id as string))?.stock).toBe(5);
    });

    it('never oversells: stock 1 and two parallel decrements give one success', async () => {
      const p = await seed({ stock: 1 });

      const results = await Promise.all([
        productsService.decrementStock(p.id as string, 1),
        productsService.decrementStock(p.id as string, 1),
      ]);

      expect(results.filter(Boolean)).toHaveLength(1);
      expect((await productModel.findById(p.id as string))?.stock).toBe(0);
    });
  });
});
