import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export class SettlementBenefitTierDto {
  @IsNumber() @Min(0) lowerYears!: number;
  @IsOptional() @IsNumber() @Min(0) upperYears?: number | null;
  @IsNumber() @Min(0) salaryMonthsPerYear!: number;
}

export class CreateSettlementPolicyDto {
  @IsString() @MaxLength(60) code!: string;
  @IsInt() @Min(1) version!: number;
  @IsString() @MaxLength(150) name!: string;
  @IsString() @MaxLength(80) jurisdiction!: string;
  @IsDateString() effectiveFrom!: string;
  @IsOptional() @IsDateString() effectiveTo?: string | null;
  @IsIn(['basic', 'gross']) benefitBase!: 'basic' | 'gross';
  @IsInt() @Min(1) @Max(366) leaveDayDivisor!: number;
  @IsOptional() @IsNumber() @Min(0) maxCompensatedLeaveDays?: number | null;
  @IsBoolean() benefitTaxable!: boolean;
  @IsBoolean() leaveTaxable!: boolean;
  @IsBoolean() recoverAllOutstandingLoans!: boolean;
  @IsString() @MaxLength(500) sourceReference!: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => SettlementBenefitTierDto)
  tiers!: SettlementBenefitTierDto[];
}

export class CreateFinalSettlementDto {
  @IsInt() @Min(1) employeeId!: number;
  @IsDateString() terminationDate!: string;
  @IsOptional() @IsNumber() @Min(0) otherEarnings?: number;
  @IsOptional() @IsNumber() @Min(0) otherDeductions?: number;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
