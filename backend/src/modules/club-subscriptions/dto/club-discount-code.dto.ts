import { Transform } from 'class-transformer';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsInt, IsNumber, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';

export class CreateClubDiscountCodeDto {
  @Transform(({ value }) => String(value ?? '').trim().toUpperCase())
  @IsString()
  code!: string;

  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0.001)
  @Max(100)
  percentage!: number;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === 1)
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateClubDiscountCodeDto {
  @IsOptional()
  @Transform(({ value }) => String(value ?? '').trim().toUpperCase())
  @IsString()
  code?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0.001)
  @Max(100)
  percentage?: number;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === 1)
  @IsBoolean()
  isActive?: boolean;
}

export class AssignDiscountCodeToEmployeeDto {
  @Transform(({ value }) => Number(value)) @IsInt() @Min(1) employeeId!: number;
  @Transform(({ value }) => Number(value)) @IsInt() @Min(1) codeId!: number;
  @Transform(({ value }) => Number(value)) @IsInt() @Min(1) count!: number;
}

export class DiscountCodeAllocationRowDto {
  @Transform(({ value }) => Number(value)) @IsInt() @Min(1) codeId!: number;
  @Transform(({ value }) => Number(value)) @IsInt() @Min(1) count!: number;
}

export class AssignDiscountCodesToEmployeeDto {
  @Transform(({ value }) => Number(value)) @IsInt() @Min(1) employeeId!: number;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => DiscountCodeAllocationRowDto)
  assignments!: DiscountCodeAllocationRowDto[];
}

export class GrantDiscountCodeToMemberDto {
  @Transform(({ value }) => Number(value)) @IsInt() @Min(1) employeeId!: number;
  @Transform(({ value }) => Number(value)) @IsInt() @Min(1) codeId!: number;
  @Transform(({ value }) => Number(value)) @IsInt() @Min(1) memberId!: number;
  @IsOptional() @IsString() expiresOn?: string;
}
