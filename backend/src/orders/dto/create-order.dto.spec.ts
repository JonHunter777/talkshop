import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { CreateOrderDto } from './create-order.dto';

const validShipping = {
  fullName: 'Ivan Petrenko',
  phone: '+380 (50) 123-45-67',
  city: 'Kyiv',
  address: 'Khreshchatyk St, 1',
};

const flatten = (errors: ValidationError[], prefix = ''): string[] =>
  errors.flatMap((error) => {
    const path = `${prefix}${error.property}`;
    return error.children && error.children.length > 0
      ? flatten(error.children, `${path}.`)
      : [path];
  });

async function errorPaths(body: Record<string, unknown>): Promise<string[]> {
  return flatten(await validate(plainToInstance(CreateOrderDto, body)));
}

const withShipping = (override: Record<string, unknown>) => ({
  shipping: { ...validShipping, ...override },
});

describe('CreateOrderDto', () => {
  it('accepts a valid body without a note', async () => {
    expect(await errorPaths({ shipping: validShipping })).toEqual([]);
  });

  it('accepts a valid body with a note', async () => {
    expect(await errorPaths({ shipping: validShipping, note: 'Call before delivery' })).toEqual([]);
  });

  describe('shipping', () => {
    it.each([undefined, null, 'Kyiv', 5, []])('rejects shipping %p', async (shipping) => {
      expect(await errorPaths({ shipping })).not.toEqual([]);
    });

    it.each(['fullName', 'phone', 'city', 'address'])('rejects a missing %s', async (field) => {
      const shipping: Record<string, unknown> = { ...validShipping };
      delete shipping[field];

      expect(await errorPaths({ shipping })).toEqual([`shipping.${field}`]);
    });

    it.each(['fullName', 'phone', 'city', 'address'])('rejects a null %s', async (field) => {
      expect(await errorPaths(withShipping({ [field]: null }))).toEqual([`shipping.${field}`]);
    });

    it.each(['fullName', 'phone', 'city', 'address'])(
      'rejects a %s that is only spaces',
      async (field) => {
        expect(await errorPaths(withShipping({ [field]: '     ' }))).toEqual([`shipping.${field}`]);
      },
    );

    it.each(['fullName', 'phone', 'city', 'address'])('trims %s', (field) => {
      const dto = plainToInstance(
        CreateOrderDto,
        withShipping({ [field]: `  ${validShipping[field as keyof typeof validShipping]}  ` }),
      );

      expect(dto.shipping[field as keyof typeof validShipping]).toBe(
        validShipping[field as keyof typeof validShipping],
      );
    });

    describe.each([
      ['fullName', 2, 100],
      ['city', 2, 100],
      ['address', 5, 200],
    ])('%s length', (field, min, max) => {
      it.each([
        [min - 1, false],
        [min, true],
        [max, true],
        [max + 1, false],
      ])('%i characters is valid: %s', async (length, isValid) => {
        const paths = await errorPaths(withShipping({ [field]: 'a'.repeat(length) }));

        expect(paths).toEqual(isValid ? [] : [`shipping.${field}`]);
      });
    });
  });

  // Decision: the limit of 20 characters INCLUDES the leading "+", and at least 7 digits are
  // required. So "+" + 19 digits is the longest valid phone with a plus, 20 digits without it.
  describe('shipping.phone', () => {
    it.each([
      ['+380 (50) 123-45-67', true],
      ['+380501234567', true],
      ['0501234567', true],
      ['050-123-45-67', true],
      ['1234567', true],
      ['+1234567', true],
    ])('accepts %p', async (phone, isValid) => {
      expect(await errorPaths(withShipping({ phone }))).toEqual(isValid ? [] : ['shipping.phone']);
    });

    describe('length limit (counts the "+")', () => {
      it.each([
        ['20 digits, no plus', '1'.repeat(20), true],
        ['21 digits, no plus', '1'.repeat(21), false],
        ['plus + 19 digits (20 characters)', `+${'1'.repeat(19)}`, true],
        ['plus + 20 digits (21 characters)', `+${'1'.repeat(20)}`, false],
      ])('%s is valid: %s', async (_name, phone, isValid) => {
        expect(await errorPaths(withShipping({ phone }))).toEqual(
          isValid ? [] : ['shipping.phone'],
        );
      });
    });

    describe('minimum 7 digits', () => {
      it.each([
        ['6 digits', '123456', false],
        ['+ and 6 digits', '+123456', false],
        ['7 digits', '1234567', true],
        ['6 digits with separators', '(12) 34-56', false],
        ['7 digits with separators', '(12) 34-567', true],
      ])('%s is valid: %s', async (_name, phone, isValid) => {
        expect(await errorPaths(withShipping({ phone }))).toEqual(
          isValid ? [] : ['shipping.phone'],
        );
      });
    });

    it.each([
      ['only hyphens', '-------'],
      ['only parentheses and spaces', '( ) ( ) ( )'],
      ['letters', 'abc1234567'],
      ['a plus in the middle', '12+34567'],
      ['two pluses', '++1234567'],
      ['a dot', '050.123.4567'],
      ['a new line', '0501234567\n0501234567'],
    ])('rejects %s', async (_name, phone) => {
      expect(await errorPaths(withShipping({ phone }))).toEqual(['shipping.phone']);
    });
  });

  describe('note', () => {
    it.each([
      ['only spaces', '     '],
      ['an empty string', ''],
      ['null', null],
      ['a number', 5],
      ['501 characters', 'a'.repeat(501)],
    ])('rejects %s', async (_name, note) => {
      expect(await errorPaths({ shipping: validShipping, note })).toEqual(['note']);
    });

    it('accepts exactly 500 characters', async () => {
      expect(await errorPaths({ shipping: validShipping, note: 'a'.repeat(500) })).toEqual([]);
    });

    it('trims the note', () => {
      const dto = plainToInstance(CreateOrderDto, { shipping: validShipping, note: '  hello  ' });

      expect(dto.note).toBe('hello');
    });
  });

  describe('with the global ValidationPipe settings', () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const metadata = { type: 'body' as const, metatype: CreateOrderDto };

    it.each([
      ['totalCents', 1],
      ['priceCents', 1],
      ['userId', '665f1c2e8a1b2c3d4e5f6a7b'],
      ['status', 'delivered'],
      ['items', []],
      ['orderNumber', 'TS-261119-AAAAAA'],
    ])('rejects a client-sent %s', async (field, value) => {
      const body = { shipping: validShipping, [field]: value };

      await expect(pipe.transform(body, metadata)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an unknown field inside shipping', async () => {
      const body = withShipping({ country: 'UA' });

      await expect(pipe.transform(body, metadata)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('returns a CreateOrderDto with trimmed values for a valid body', async () => {
      const body = { shipping: { ...validShipping, city: '  Kyiv  ' }, note: ' hi ' };

      const result: unknown = await pipe.transform(body, metadata);

      expect(result).toBeInstanceOf(CreateOrderDto);
      expect(result).toMatchObject({ shipping: { city: 'Kyiv' }, note: 'hi' });
    });
  });
});
