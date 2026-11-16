import { isDuplicateKeyError } from './mongo-errors';

describe('isDuplicateKeyError', () => {
  it('is true for an object with code 11000', () => {
    expect(isDuplicateKeyError({ code: 11000 })).toBe(true);
  });

  it('is true for an Error with code 11000', () => {
    const error = Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
    expect(isDuplicateKeyError(error)).toBe(true);
  });

  it.each([
    ['another numeric code', { code: 12345 }],
    ['code as a string', { code: '11000' }],
    ['null', null],
    ['undefined', undefined],
    ['a string', 'E11000'],
    ['a number', 11000],
    ['a plain Error', new Error('boom')],
  ])('is false for %s', (_name, value) => {
    expect(isDuplicateKeyError(value)).toBe(false);
  });
});
