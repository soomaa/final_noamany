import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class DryRunQueryDto {
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1' || value === 1)
  @IsBoolean()
  dryRun?: boolean;
}
