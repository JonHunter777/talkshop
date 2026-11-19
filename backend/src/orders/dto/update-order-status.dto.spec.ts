import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateOrderStatusDto } from './update-order-status.dto';

async function errorFields(body: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(plainToInstance(UpdateOrderStatusDto, body));
  return errors.map((e) => e.property);
}

describe('UpdateOrderStatusDto', () => {
  it.each(['processing', 'shipped', 'delivered'])('accepts %s', async (status) => {
    expect(await errorFields({ status })).toEqual([]);
  });

  // `cancelled` must go through POST /orders/:id/cancel, which returns the stock
  it('rejects cancelled', async () => {
    expect(await errorFields({ status: 'cancelled' })).toEqual(['status']);
  });

  it.each([
    ['pending', 'pending'],
    ['an unknown value', 'refunded'],
    ['a different case', 'Processing'],
    ['an empty string', ''],
    ['null', null],
    ['a number', 1],
    ['an array', ['processing']],
    ['an operator object', { $ne: 'pending' }],
    ['a missing field', undefined],
  ])('rejects %s', async (_name, status) => {
    expect(await errorFields({ status })).toEqual(['status']);
  });

  describe('with the global ValidationPipe settings', () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const metadata = { type: 'body' as const, metatype: UpdateOrderStatusDto };

    it('rejects an extra field', async () => {
      const body = { status: 'processing', userId: '665f1c2e8a1b2c3d4e5f6a7b' };

      await expect(pipe.transform(body, metadata)).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
