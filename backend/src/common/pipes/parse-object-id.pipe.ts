import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

// Strict check: mongoose isValidObjectId also accepts any 12-char string
const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

@Injectable()
export class ParseObjectIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (typeof value !== 'string' || !OBJECT_ID_REGEX.test(value)) {
      throw new BadRequestException('Invalid id');
    }
    return value;
  }
}
