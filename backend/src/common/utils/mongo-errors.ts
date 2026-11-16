const DUPLICATE_KEY_CODE = 11000;

// True for MongoServerError E11000 (unique index violation)
export function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === DUPLICATE_KEY_CODE
  );
}
