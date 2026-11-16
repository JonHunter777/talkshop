// Strict check: mongoose isValidObjectId also accepts any 12-char string
const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

export function isObjectIdString(value: unknown): value is string {
  return typeof value === 'string' && OBJECT_ID_REGEX.test(value);
}
