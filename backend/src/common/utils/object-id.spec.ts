import { isObjectIdString } from './object-id';

describe('isObjectIdString', () => {
  it.each([
    ['24 lowercase hex chars', '507f1f77bcf86cd799439011'],
    ['24 uppercase hex chars', '507F1F77BCF86CD799439011'],
    ['24 mixed-case hex chars', '507f1F77bcF86cd799439011'],
  ])('is true for %s', (_name, value) => {
    expect(isObjectIdString(value)).toBe(true);
  });

  it.each([
    ['a 12-char string', 'abcdefghijkl'],
    ['23 chars', '507f1f77bcf86cd79943901'],
    ['25 chars', '507f1f77bcf86cd7994390111'],
    ['24 non-hex chars', 'zzzzzzzzzzzzzzzzzzzzzzzz'],
    ['an empty string', ''],
    ['a number', 123],
    ['null', null],
    ['undefined', undefined],
    ['an object', {}],
  ])('is false for %s', (_name, value) => {
    expect(isObjectIdString(value)).toBe(false);
  });
});
