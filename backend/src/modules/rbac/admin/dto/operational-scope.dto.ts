import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AssignOperationalScopeDto {
  @Type(() => Number)
  @IsInt()
  branchId!: number;

  @IsIn(['female', 'male'])
  section!: 'female' | 'male';
}

export class SetSectionExceptionDto extends AssignOperationalScopeDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
