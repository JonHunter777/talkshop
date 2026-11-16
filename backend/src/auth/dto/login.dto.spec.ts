import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto } from './login.dto';

const validBody = { email: 'ann@example.com', password: 'whatever' };

async function validateBody(body: Record<string, unknown>) {
  const dto = plainToInstance(LoginDto, body);
  const errors = await validate(dto);
  return { dto, errorFields: errors.map((e) => e.property) };
}

describe('LoginDto', () => {
  it('accepts a valid body', async () => {
    const { errorFields } = await validateBody(validBody);

    expect(errorFields).toEqual([]);
  });

  it('trims and lowercases the email', async () => {
    const { dto } = await validateBody({ ...validBody, email: '  ANN@Example.COM ' });

    expect(dto.email).toBe('ann@example.com');
  });

  it('rejects an invalid email', async () => {
    const { errorFields } = await validateBody({ ...validBody, email: 'nope' });

    expect(errorFields).toEqual(['email']);
  });

  it('rejects an empty password', async () => {
    const { errorFields } = await validateBody({ ...validBody, password: '' });

    expect(errorFields).toEqual(['password']);
  });

  it('rejects a missing password', async () => {
    const { errorFields } = await validateBody({ email: 'ann@example.com' });

    expect(errorFields).toEqual(['password']);
  });

  it('accepts a 72-character password', async () => {
    const { errorFields } = await validateBody({ ...validBody, password: 'a'.repeat(72) });

    expect(errorFields).toEqual([]);
  });

  it('rejects a 73-character password', async () => {
    const { errorFields } = await validateBody({ ...validBody, password: 'a'.repeat(73) });

    expect(errorFields).toEqual(['password']);
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
    const errors = await validate(plainToInstance(LoginDto, { ...validBody, password }));

    const messages = Object.values(errors[0]?.constraints ?? {});
    expect(messages).toEqual([expect.stringContaining('password must be at most 72 bytes')]);
    expect(messages[0]).not.toContain(password);
  });

  it('accepts a short password (the length rule is only for registration)', async () => {
    const { errorFields } = await validateBody({ ...validBody, password: 'abc' });

    expect(errorFields).toEqual([]);
  });
});
