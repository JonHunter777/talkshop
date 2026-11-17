import { PartialType } from '@nestjs/swagger';
import { CreateProductDto } from './create-product.dto';

// Every field is optional; the validation rules are the same as on create.
// If `attributes` is sent, it replaces the whole attributes object.
// `skipNullProperties: false`: a field may be absent, but `null` is still validated (and rejected).
// With the default (true) PartialType uses `@IsOptional()`, which lets `null` through.
export class UpdateProductDto extends PartialType(CreateProductDto, {
  skipNullProperties: false,
}) {}
