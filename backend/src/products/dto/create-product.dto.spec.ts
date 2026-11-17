import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProductDto } from './create-product.dto';
import { UpdateProductDto } from './update-product.dto';

const validBody = {
  name: 'Linen tablecloth',
  slug: 'linen-tablecloth-120',
  description: 'Soft stonewashed linen.',
  category: 'textile',
  priceCents: 129900,
};

async function validateBody(body: Record<string, unknown>) {
  const dto = plainToInstance(CreateProductDto, body);
  const errors = await validate(dto);
  return { dto, errorFields: errors.map((e) => e.property) };
}

describe('CreateProductDto', () => {
  it('accepts a valid minimal body', async () => {
    const { errorFields } = await validateBody(validBody);

    expect(errorFields).toEqual([]);
  });

  it('accepts images and attributes', async () => {
    const { errorFields } = await validateBody({
      ...validBody,
      stock: 5,
      images: ['https://images.example.com/a.jpg'],
      attributes: { material: 'linen', color: 'beige' },
    });

    expect(errorFields).toEqual([]);
  });

  describe('priceCents', () => {
    it.each([
      [0, false],
      [1, true],
      [100_000_000, true],
      [100_000_001, false],
      [10.5, false],
      ['100', false],
    ])('%p is valid: %s', async (priceCents, isValid) => {
      const { errorFields } = await validateBody({ ...validBody, priceCents });

      expect(errorFields).toEqual(isValid ? [] : ['priceCents']);
    });
  });

  describe('stock', () => {
    it.each([
      [0, true],
      [-1, false],
      [1.5, false],
      [1_000_001, false],
    ])('%p is valid: %s', async (stock, isValid) => {
      const { errorFields } = await validateBody({ ...validBody, stock });

      expect(errorFields).toEqual(isValid ? [] : ['stock']);
    });
  });

  describe('slug', () => {
    it.each([
      ['linen-tablecloth', true],
      ['a1', true],
      ['Linen', false],
      ['two--hyphens', false],
      ['-leading', false],
      ['trailing-', false],
      ['has space', false],
      ['килим', false],
    ])('%p is valid: %s', async (slug, isValid) => {
      const { errorFields } = await validateBody({ ...validBody, slug });

      expect(errorFields).toEqual(isValid ? [] : ['slug']);
    });
  });

  it('rejects an unknown category', async () => {
    const { errorFields } = await validateBody({ ...validBody, category: 'toys' });

    expect(errorFields).toEqual(['category']);
  });

  describe('images', () => {
    it('rejects more than 10 images', async () => {
      const images = Array.from({ length: 11 }, (_, i) => `https://images.example.com/${i}.jpg`);

      const { errorFields } = await validateBody({ ...validBody, images });

      expect(errorFields).toEqual(['images']);
    });

    it.each(['not a url', 'javascript:alert(1)', 'ftp://example.com/a.jpg', '/relative.jpg'])(
      'rejects %p',
      async (url) => {
        const { errorFields } = await validateBody({ ...validBody, images: [url] });

        expect(errorFields).toEqual(['images']);
      },
    );
  });

  it('trims name and description', async () => {
    const { dto } = await validateBody({ ...validBody, name: '  Cup  ', description: ' Nice ' });

    expect(dto).toMatchObject({ name: 'Cup', description: 'Nice' });
  });

  it('rejects a name that is only spaces', async () => {
    const { errorFields } = await validateBody({ ...validBody, name: '   ' });

    expect(errorFields).toEqual(['name']);
  });

  it('rejects invalid nested attributes', async () => {
    const { errorFields } = await validateBody({ ...validBody, attributes: { material: 5 } });

    expect(errorFields).toEqual(['attributes']);
  });

  describe('with the global ValidationPipe settings', () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });

    it('rejects an unknown field (e.g. createdAt or _id from the client)', async () => {
      const metadata = { type: 'body' as const, metatype: CreateProductDto };

      await expect(pipe.transform({ ...validBody, _id: 'x' }, metadata)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects an unknown nested attribute', async () => {
      const metadata = { type: 'body' as const, metatype: CreateProductDto };
      const body = { ...validBody, attributes: { weight: '1kg' } };

      await expect(pipe.transform(body, metadata)).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});

describe('UpdateProductDto', () => {
  it('accepts a body with a single field', async () => {
    const errors = await validate(plainToInstance(UpdateProductDto, { priceCents: 5000 }));

    expect(errors).toEqual([]);
  });

  it('keeps the rules of the create DTO', async () => {
    const errors = await validate(plainToInstance(UpdateProductDto, { priceCents: 0 }));

    expect(errors.map((e) => e.property)).toEqual(['priceCents']);
  });
});
