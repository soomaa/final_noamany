import { Transform } from 'class-transformer';
import { IsBoolean } from 'class-validator';

export class UpdateCafeProductStatusDto {
  @Transform(({ value }) => value === true || value === 'true' || value === 1 || value === '1')
  @IsBoolean()
  isActive!: boolean;
}
