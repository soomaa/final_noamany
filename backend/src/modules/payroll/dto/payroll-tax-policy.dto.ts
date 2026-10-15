import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class PayrollTaxBracketDto {
  @IsNumber()
  @Min(0)
  lowerBound!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  upperBound?: number | null;

  @IsNumber()
  @Min(0)
  @Max(100)
  ratePercent!: number;
}

export class CreatePayrollTaxPolicyDto {
  @IsString()
  @MaxLength(60)
  code!: string;

  @IsInt()
  @Min(1)
  version!: number;

  @IsString()
  @MaxLength(150)
  name!: string;

  @IsString()
  @MaxLength(80)
  jurisdiction!: string;

  @IsDateString()
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string | null;

  @IsNumber()
  @Min(0)
  annualAllowance!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  annualTaxCredit?: number;

  @IsInt()
  @Min(1)
  @Max(366)
  periodsPerYear!: number;

  @IsString()
  @MaxLength(500)
  sourceReference!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PayrollTaxBracketDto)
  brackets!: PayrollTaxBracketDto[];
}
