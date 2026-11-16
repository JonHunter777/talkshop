import { validate } from 'class-validator';
import { MaxBytes } from './max-bytes.validator';

class DummyDto {
  @MaxBytes(10)
  value!: unknown;
}

class CustomMessageDto {
  @MaxBytes(10, { message: 'too big' })
  value!: unknown;
}

function makeDto(value: unknown): DummyDto {
  const dto = new DummyDto();
  dto.value = value;
  return dto;
}

describe('MaxBytes', () => {
  it.each([
    ['10 ASCII characters', 'a'.repeat(10)],
    ['5 Cyrillic letters (10 bytes)', 'я'.repeat(5)],
    ['2 emoji + 2 ASCII (10 bytes)', '😀😀ab'],
    ['an empty string', ''],
  ])('accepts %s', async (_title, value) => {
    const errors = await validate(makeDto(value));

    expect(errors).toHaveLength(0);
  });

  it.each([
    ['11 ASCII characters', 'a'.repeat(11)],
    ['6 Cyrillic letters (12 bytes)', 'я'.repeat(6)],
    ['3 emoji (12 bytes)', '😀😀😀'],
  ])('rejects %s', async (_title, value) => {
    const errors = await validate(makeDto(value));

    expect(errors.map((e) => e.property)).toEqual(['value']);
  });

  it.each([
    ['a number', 12345],
    ['null', null],
    ['undefined', undefined],
    ['an object', { a: 1 }],
  ])('rejects %s (not a string)', async (_title, value) => {
    const errors = await validate(makeDto(value));

    expect(errors.map((e) => e.property)).toEqual(['value']);
  });

  it('error message has the property name and the limit, but not the value', async () => {
    const secret = 'super-secret-value';

    const errors = await validate(makeDto(secret));

    const messages = Object.values(errors[0]?.constraints ?? {});
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('value');
    expect(messages[0]).toContain('10');
    expect(messages[0]).not.toContain(secret);
  });

  it('uses a custom message from validation options', async () => {
    const dto = new CustomMessageDto();
    dto.value = 'a'.repeat(11);

    const errors = await validate(dto);

    expect(errors[0]?.constraints).toEqual({ maxBytes: 'too big' });
  });
});
