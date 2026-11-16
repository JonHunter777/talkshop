import { BadRequestException } from '@nestjs/common';
import { ParseObjectIdPipe } from './parse-object-id.pipe';

describe('ParseObjectIdPipe', () => {
  const pipe = new ParseObjectIdPipe();

  it('returns a lowercase 24-hex id as is', () => {
    const id = '507f1f77bcf86cd799439011';
    expect(pipe.transform(id)).toBe(id);
  });

  it('returns an uppercase 24-hex id as is', () => {
    const id = '507F1F77BCF86CD799439011';
    expect(pipe.transform(id)).toBe(id);
  });

  it.each([
    ['a 12-char string (valid for mongoose, but not for us)', 'abcdefghijkl'],
    ['23 chars', '507f1f77bcf86cd79943901'],
    ['25 chars', '507f1f77bcf86cd7994390111'],
    ['24 chars with non-hex letters', '507f1f77bcf86cd79943901z'],
    ['an empty string', ''],
    ['a string with spaces', '507f1f77 bcf86cd7 99439011'],
    ['an id with surrounding spaces', ' 507f1f77bcf86cd799439011 '],
    ['a malformed mix', '507f-1f77-bcf8-6cd7-9943-9011'],
  ])('throws BadRequestException for %s', (_name, value) => {
    expect(() => pipe.transform(value)).toThrow(BadRequestException);
  });
});
