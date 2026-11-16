import { buildPaginated, getSkip } from './paginated-response';

describe('buildPaginated', () => {
  it('returns items, total, page and limit', () => {
    const result = buildPaginated(['a', 'b'], 12, { page: 2, limit: 5 });

    expect(result).toEqual({ items: ['a', 'b'], total: 12, page: 2, limit: 5 });
  });

  it('returns an empty list with total 0', () => {
    const result = buildPaginated([], 0, { page: 1, limit: 20 });

    expect(result).toEqual({ items: [], total: 0, page: 1, limit: 20 });
  });
});

describe('getSkip', () => {
  it('skips nothing on the first page', () => {
    expect(getSkip(1, 20)).toBe(0);
  });

  it('skips two full pages on page 3 with limit 20', () => {
    expect(getSkip(3, 20)).toBe(40);
  });
});
