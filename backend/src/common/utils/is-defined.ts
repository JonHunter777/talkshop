// For @ValidateIf: an optional field may be absent (undefined), but never `null`.
// `@IsOptional()` would also let `null` through to Mongoose, which fails there with a 500
// instead of a 400. Use `@ValidateIf(isDefined)` for optional body fields.
export const isDefined = (_object: unknown, value: unknown): boolean => value !== undefined;
