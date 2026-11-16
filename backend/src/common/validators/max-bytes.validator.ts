import { ValidationArguments, ValidationOptions, registerDecorator } from 'class-validator';

// Limits the UTF-8 size of a string in bytes, not in characters.
// Needed for bcrypt: it reads only the first 72 bytes, and one Cyrillic letter is 2 bytes.
export function MaxBytes(max: number, validationOptions?: ValidationOptions): PropertyDecorator {
  return (object: object, propertyName: string | symbol): void => {
    registerDecorator({
      name: 'maxBytes',
      target: object.constructor,
      propertyName: String(propertyName),
      constraints: [max],
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= max;
        },
        // Never include the value itself: it may be a password
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} must be at most ${max} bytes in UTF-8 (about ${Math.floor(max / 2)} Cyrillic letters; Latin letters and digits take 1 byte each)`;
        },
      },
    });
  };
}
