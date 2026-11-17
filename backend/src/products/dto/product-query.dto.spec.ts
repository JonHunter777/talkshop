import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ProductQueryDto } from './product-query.dto';

// Query values always arrive as strings
async function validateQuery(query: Record<string, unknown>) {
  const dto = plainToInstance(ProductQueryDto, query);
  const errors = await validate(dto);
  return { dto, errorFields: errors.map((e) => e.property) };
}

describe('ProductQueryDto', () => {
  it('uses defaults for an empty query', async () => {
    const { dto, errorFields } = await validateQuery({});

    expect(errorFields).toEqual([]);
    expect(dto).toMatchObject({ page: 1, limit: 20, sort: 'newest' });
  });

  it('converts numeric strings', async () => {
    const { dto, errorFields } = await validateQuery({
      page: '2',
      limit: '10',
      minPriceCents: '1000',
      maxPriceCents: '5000',
    });

    expect(errorFields).toEqual([]);
    expect(dto).toMatchObject({ page: 2, limit: 10, minPriceCents: 1000, maxPriceCents: 5000 });
  });

  it.each([
    [50, true],
    [51, false],
    [0, false],
  ])('limit=%i is valid: %s', async (limit, isValid) => {
    const { errorFields } = await validateQuery({ limit: String(limit) });

    expect(errorFields).toEqual(isValid ? [] : ['limit']);
  });

  it('rejects an unknown category', async () => {
    const { errorFields } = await validateQuery({ category: 'toys' });

    expect(errorFields).toEqual(['category']);
  });

  it('rejects a category passed as an operator object (NoSQL injection attempt)', async () => {
    const { errorFields } = await validateQuery({ category: { $ne: 'kitchen' } });

    expect(errorFields).toEqual(['category']);
  });

  it('rejects q passed as an object or an array', async () => {
    expect((await validateQuery({ q: { $ne: 'x' } })).errorFields).toEqual(['q']);
    expect((await validateQuery({ q: ['a', 'b'] })).errorFields).toEqual(['q']);
  });

  it.each([
    [100, true],
    [101, false],
  ])('q of %i characters is valid: %s', async (length, isValid) => {
    const { errorFields } = await validateQuery({ q: 'a'.repeat(length) });

    expect(errorFields).toEqual(isValid ? [] : ['q']);
  });

  it('trims q and rejects an empty one', async () => {
    expect((await validateQuery({ q: '  linen ' })).dto.q).toBe('linen');
    expect((await validateQuery({ q: '   ' })).errorFields).toEqual(['q']);
  });

  it.each(['abc', '1.5', '-1'])('rejects minPriceCents=%p', async (value) => {
    const { errorFields } = await validateQuery({ minPriceCents: value });

    expect(errorFields).toEqual(['minPriceCents']);
  });

  it('rejects an unknown sort', async () => {
    const { errorFields } = await validateQuery({ sort: 'cheapest' });

    expect(errorFields).toEqual(['sort']);
  });
});
