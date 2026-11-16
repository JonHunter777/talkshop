import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { isObjectIdString } from '../utils/object-id';

@Injectable()
export class ParseObjectIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!isObjectIdString(value)) {
      throw new BadRequestException('Invalid id');
    }
    return value;
  }
}
