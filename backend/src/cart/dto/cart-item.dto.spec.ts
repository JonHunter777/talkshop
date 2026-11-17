import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AddCartItemDto } from './add-cart-item.dto';
import { UpdateCartItemDto } from './update-cart-item.dto';

const PRODUCT_ID = '665f1c2e8a1b2c3d4e5f6a7b';

async function errorFields<T extends object>(cls: new () => T, body: Record<string, unknown>) {
  const errors = await validate(plainToInstance(cls, body));
  return errors.map((e) => e.property);
}

describe('AddCartItemDto', () => {
  it('accepts a valid body', async () => {
    expect(await errorFields(AddCartItemDto, { productId: PRODUCT_ID, quantity: 2 })).toEqual([]);
  });

  it.each([
    [0, false],
    [1, true],
    [99, true],
    [100, false],
    [1.5, false],
    ['2', false],
    [null, false],
  ])('quantity %p is valid: %s', async (quantity, isValid) => {
    const fields = await errorFields(AddCartItemDto, { productId: PRODUCT_ID, quantity });

    expect(fields).toEqual(isValid ? [] : ['quantity']);
  });

  it.each(['123', 'not-an-id', 123, null, undefined])('rejects productId %p', async (productId) => {
    const fields = await errorFields(AddCartItemDto, { productId, quantity: 1 });

    expect(fields).toEqual(['productId']);
  });

  it('rejects an extra field userId with the global ValidationPipe settings', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const body = { productId: PRODUCT_ID, quantity: 1, userId: PRODUCT_ID };

    await expect(
      pipe.transform(body, { type: 'body', metatype: AddCartItemDto }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('UpdateCartItemDto', () => {
  it.each([
    [0, false],
    [1, true],
    [99, true],
    [100, false],
    [1.5, false],
    [null, false],
  ])('quantity %p is valid: %s', async (quantity, isValid) => {
    expect(await errorFields(UpdateCartItemDto, { quantity })).toEqual(isValid ? [] : ['quantity']);
  });

  it('rejects a missing quantity', async () => {
    expect(await errorFields(UpdateCartItemDto, {})).toEqual(['quantity']);
  });
});
