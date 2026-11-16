import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PaginationQueryDto } from './pagination-query.dto';

// Same two steps as the global ValidationPipe with transform: true
async function parse(query: Record<string, unknown>) {
  const dto = plainToInstance(PaginationQueryDto, query);
  const errors = await validate(dto);
  return { dto, errors };
}

describe('PaginationQueryDto', () => {
  it('uses page=1 and limit=20 when the query is empty', async () => {
    const { dto, errors } = await parse({});

    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
  });

  it('converts numeric strings to numbers', async () => {
    const { dto, errors } = await parse({ page: '2', limit: '50' });

    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(2);
    expect(dto.limit).toBe(50);
  });

  it('accepts the upper boundary limit=50', async () => {
    const { errors } = await parse({ limit: '50' });
    expect(errors).toHaveLength(0);
  });

  it.each([
    ['page=0', { page: '0' }, 'page'],
    ['page=-1', { page: '-1' }, 'page'],
    ['page=1.5', { page: '1.5' }, 'page'],
    ['page=abc', { page: 'abc' }, 'page'],
    ['limit=0', { limit: '0' }, 'limit'],
    ['limit=51', { limit: '51' }, 'limit'],
    ['limit=abc', { limit: 'abc' }, 'limit'],
  ])('rejects %s', async (_name, query, property) => {
    const { errors } = await parse(query);

    expect(errors.map((e) => e.property)).toContain(property);
  });
});
