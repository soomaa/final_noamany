import { Transform } from 'class-transformer';
import { IsInt, IsOptional } from 'class-validator';

export class ValidateEntitlementDto {
  @Transform(({ value }) => Number(value))
  @IsInt()
  memberId!: number;

  @IsOptional()
  @Transform(({ value }) => (value != null && value !== '' ? Number(value) : undefined))
  @IsInt()
  branchId?: number;
}
