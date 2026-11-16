import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterDto } from './register.dto';

const validBody = { email: 'ann@example.com', password: 'correct-horse', name: 'Ann' };

// Same steps as the global ValidationPipe: plain object -> class instance (with @Transform) -> validate
async function validateBody(body: Record<string, unknown>) {
  const dto = plainToInstance(RegisterDto, body);
  const errors = await validate(dto);
  return { dto, errorFields: errors.map((e) => e.property) };
}

describe('RegisterDto', () => {
  it('accepts a valid body', async () => {
    const { errorFields } = await validateBody(validBody);

    expect(errorFields).toEqual([]);
  });

  describe('email', () => {
    it('trims and lowercases the email', async () => {
      const { dto } = await validateBody({ ...validBody, email: ' A@B.com ' });

      expect(dto.email).toBe('a@b.com');
    });

    it('rejects an invalid email', async () => {
      const { errorFields } = await validateBody({ ...validBody, email: 'not-an-email' });

      expect(errorFields).toEqual(['email']);
    });

    it('rejects a non-string email', async () => {
      const { errorFields } = await validateBody({ ...validBody, email: 123 });

      expect(errorFields).toEqual(['email']);
    });
  });

  describe('password', () => {
    it.each([
      [7, false],
      [8, true],
      [72, true],
      [73, false],
    ])('with %i characters is valid: %s', async (length, isValid) => {
      const { errorFields } = await validateBody({ ...validBody, password: 'a'.repeat(length) });

      expect(errorFields).toEqual(isValid ? [] : ['password']);
    });

    it('accepts 36 Cyrillic letters (exactly 72 bytes)', async () => {
      const { errorFields } = await validateBody({ ...validBody, password: 'я'.repeat(36) });

      expect(errorFields).toEqual([]);
    });

    it('rejects 72 Cyrillic letters (144 bytes)', async () => {
      const { errorFields } = await validateBody({ ...validBody, password: 'я'.repeat(72) });

      expect(errorFields).toEqual(['password']);
    });

    it('rejects 37 Cyrillic letters (74 bytes)', async () => {
      const { errorFields } = await validateBody({ ...validBody, password: 'я'.repeat(37) });

      expect(errorFields).toEqual(['password']);
    });

    it('explains the byte limit in the error message without the password value', async () => {
      const password = 'я'.repeat(72);
      const errors = await validate(plainToInstance(RegisterDto, { ...validBody, password }));

      const messages = Object.values(errors[0]?.constraints ?? {});
      expect(messages).toEqual([expect.stringContaining('password must be at most 72 bytes')]);
      expect(messages[0]).not.toContain(password);
    });

    it('rejects a non-string password', async () => {
      const { errorFields } = await validateBody({ ...validBody, password: 12345678 });

      expect(errorFields).toEqual(['password']);
    });

    it('does not trim the password', async () => {
      const { dto } = await validateBody({ ...validBody, password: '  spaced out  ' });

      expect(dto.password).toBe('  spaced out  ');
    });
  });

  describe('name', () => {
    it.each([
      [1, false],
      [2, true],
      [60, true],
      [61, false],
    ])('with %i characters is valid: %s', async (length, isValid) => {
      const { errorFields } = await validateBody({ ...validBody, name: 'n'.repeat(length) });

      expect(errorFields).toEqual(isValid ? [] : ['name']);
    });

    it('trims the name', async () => {
      const { dto } = await validateBody({ ...validBody, name: '  Ann  ' });

      expect(dto.name).toBe('Ann');
    });

    it('rejects a name that is only spaces', async () => {
      const { errorFields } = await validateBody({ ...validBody, name: '    ' });

      expect(errorFields).toEqual(['name']);
    });
  });

  describe('with the global ValidationPipe settings', () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const metadata = { type: 'body' as const, metatype: RegisterDto };

    it('rejects an extra field "role" (no privilege escalation through register)', async () => {
      const body = { ...validBody, role: 'admin' };

      await expect(pipe.transform(body, metadata)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects any other extra field', async () => {
      const body = { ...validBody, isVerified: true };

      await expect(pipe.transform(body, metadata)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('returns a RegisterDto instance with normalized values for a valid body', async () => {
      const body = { ...validBody, email: ' ANN@Example.com ', name: ' Ann ' };

      const result: unknown = await pipe.transform(body, metadata);

      expect(result).toBeInstanceOf(RegisterDto);
      expect(result).toMatchObject({ email: 'ann@example.com', name: 'Ann' });
    });
  });
});
