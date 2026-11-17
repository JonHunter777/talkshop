import { Types } from 'mongoose';
import type { ProductRecord } from '../products/products.types';
import { buildCartView } from './cart.view';

const makeProduct = (overrides: Partial<ProductRecord> = {}): ProductRecord => ({
  _id: new Types.ObjectId(),
  name: 'Linen tablecloth',
  slug: 'linen-tablecloth',
  description: 'Soft linen.',
  category: 'textile',
  priceCents: 1000,
  stock: 10,
  images: ['https://images.example.com/a.jpg', 'https://images.example.com/b.jpg'],
  attributes: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('buildCartView', () => {
  it('returns an empty cart that cannot be checked out', () => {
    expect(buildCartView([], [])).toEqual({
      items: [],
      totalCents: 0,
      currency: 'UAH',
      canCheckout: false,
    });
  });

  it('takes name, price and the first image from the product and computes totals', () => {
    const product = makeProduct({ priceCents: 1250 });

    const cart = buildCartView([{ productId: product._id, quantity: 3 }], [product]);

    expect(cart.items[0]).toEqual({
      productId: product._id.toString(),
      quantity: 3,
      available: true,
      exceedsStock: false,
      name: 'Linen tablecloth',
      slug: 'linen-tablecloth',
      priceCents: 1250,
      stock: 10,
      image: 'https://images.example.com/a.jpg',
      lineTotalCents: 3750,
    });
    expect(cart.totalCents).toBe(3750);
    expect(cart.canCheckout).toBe(true);
  });

  it('uses null for the image of a product without images', () => {
    const product = makeProduct({ images: [] });

    const cart = buildCartView([{ productId: product._id, quantity: 1 }], [product]);

    expect(cart.items[0]?.image).toBeNull();
  });

  it('keeps the order of the cart lines, not the order of the products', () => {
    const a = makeProduct({ name: 'A' });
    const b = makeProduct({ name: 'B' });

    const cart = buildCartView(
      [
        { productId: b._id, quantity: 1 },
        { productId: a._id, quantity: 1 },
      ],
      [a, b],
    );

    expect(cart.items.map((item) => item.name)).toEqual(['B', 'A']);
  });

  describe('a deleted product', () => {
    it('is unavailable, has no product data and costs nothing', () => {
      const missingId = new Types.ObjectId();

      const cart = buildCartView([{ productId: missingId, quantity: 2 }], []);

      expect(cart.items[0]).toEqual({
        productId: missingId.toString(),
        quantity: 2,
        available: false,
        exceedsStock: false,
        name: null,
        slug: null,
        priceCents: null,
        stock: null,
        image: null,
        lineTotalCents: 0,
      });
      expect(cart.totalCents).toBe(0);
    });

    it('is left out of the total, and canCheckout becomes false', () => {
      const product = makeProduct({ priceCents: 500 });

      const cart = buildCartView(
        [
          { productId: product._id, quantity: 2 },
          { productId: new Types.ObjectId(), quantity: 1 },
        ],
        [product],
      );

      expect(cart.totalCents).toBe(1000);
      expect(cart.canCheckout).toBe(false);
    });
  });

  describe('exceedsStock', () => {
    it.each([
      [5, 5, false],
      [6, 5, true],
      [1, 0, true],
    ])('quantity %i with stock %i: %s', (quantity, stock, expected) => {
      const product = makeProduct({ stock });

      const cart = buildCartView([{ productId: product._id, quantity }], [product]);

      expect(cart.items[0]?.exceedsStock).toBe(expected);
    });

    it('is still counted in the total, but canCheckout becomes false', () => {
      const product = makeProduct({ priceCents: 1000, stock: 1 });

      const cart = buildCartView([{ productId: product._id, quantity: 3 }], [product]);

      expect(cart.totalCents).toBe(3000);
      expect(cart.canCheckout).toBe(false);
    });
  });

  it('allows checkout only when every line is available and within stock', () => {
    const ok = makeProduct({ stock: 5 });
    const low = makeProduct({ stock: 1 });

    expect(
      buildCartView(
        [
          { productId: ok._id, quantity: 5 },
          { productId: low._id, quantity: 1 },
        ],
        [ok, low],
      ).canCheckout,
    ).toBe(true);
    expect(
      buildCartView(
        [
          { productId: ok._id, quantity: 5 },
          { productId: low._id, quantity: 2 },
        ],
        [ok, low],
      ).canCheckout,
    ).toBe(false);
  });
});
