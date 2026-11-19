import { generateOrderNumber, ORDER_NUMBER_REGEX } from './order-number';

describe('generateOrderNumber', () => {
  it('has the format TS-YYMMDD-XXXXXX', () => {
    expect(generateOrderNumber()).toMatch(ORDER_NUMBER_REGEX);
  });

  it('puts the UTC date of the given moment into the number', () => {
    const number = generateOrderNumber(new Date('2026-03-07T23:59:59Z'));

    expect(number.startsWith('TS-260307-')).toBe(true);
  });

  it('uses UTC, not local time, around midnight', () => {
    const number = generateOrderNumber(new Date('2026-12-31T23:30:00Z'));

    expect(number.startsWith('TS-261231-')).toBe(true);
  });

  it('never uses the confusing characters 0, 1, O and I in the suffix', () => {
    for (let i = 0; i < 500; i++) {
      const suffix = generateOrderNumber().split('-')[2] ?? '';

      expect(suffix).toHaveLength(6);
      expect(suffix).not.toMatch(/[01OI]/);
    }
  });

  it('gives different numbers (no repeats in a sample of 2000)', () => {
    const numbers = new Set(Array.from({ length: 2000 }, () => generateOrderNumber()));

    expect(numbers.size).toBe(2000);
  });
});

describe('ORDER_NUMBER_REGEX', () => {
  it.each([
    ['TS-261119-K7M2QX', true],
    ['TS-261119-K7M2Q', false],
    ['TS-261119-K7M2QXX', false],
    ['TS-26111-K7M2QX', false],
    ['ts-261119-K7M2QX', false],
    ['TS-261119-K7M2Q0', false],
    ['TS-261119-k7m2qx', false],
  ])('%s is valid: %s', (value, isValid) => {
    expect(ORDER_NUMBER_REGEX.test(value)).toBe(isValid);
  });
});
