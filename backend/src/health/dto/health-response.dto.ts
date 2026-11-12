import { ApiProperty } from '@nestjs/swagger';

export class HealthOkDto {
  @ApiProperty({ example: 'ok' })
  status!: 'ok';

  @ApiProperty({ example: 'up' })
  db!: 'up';
}

export class HealthErrorDto {
  @ApiProperty({ example: 'error' })
  status!: 'error';

  @ApiProperty({ example: 'down' })
  db!: 'down';
}
