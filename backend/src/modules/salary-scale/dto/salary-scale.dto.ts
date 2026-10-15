import { IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateSalaryScaleDto {
  @IsString() @IsNotEmpty() @MaxLength(255) mo2hel!: string;
  @IsString() @IsNotEmpty() @MaxLength(255) martba!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) dawamType!: string;
  @IsNumber() @Min(0) salaryStart!: number;
  @IsNumber() @Min(0) yearBonusValue!: number;
}

export class UpdateSalaryScaleDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(255) mo2hel?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(255) martba?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) dawamType?: string;
  @IsOptional() @IsNumber() @Min(0) salaryStart?: number;
  @IsOptional() @IsNumber() @Min(0) yearBonusValue?: number;
}
