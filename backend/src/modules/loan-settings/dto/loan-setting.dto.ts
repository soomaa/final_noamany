import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

export class UpdateMainLoanSettingDto {
  @IsOptional() @IsNumber() @Min(0) da3mValue?: number;
  @IsOptional() @IsNumber() @Min(0) aqsaModaSadad?: number;
  @IsOptional() @IsNumber() @Min(0) hadAdna?: number;
  @IsOptional() @IsNumber() @Min(0) ratebAsasy?: number;
  @IsOptional() @IsNumber() @Min(0) bdlSakn?: number;
  @IsOptional() @IsNumber() @Min(0) bdlMowaslat?: number;
  @IsOptional() @IsNumber() @Min(0) bdlJwal?: number;
  @IsOptional() @IsNumber() @Min(0) ratebMokto3?: number;
  @IsOptional() @IsNumber() @Min(0) bdlAmal?: number;
  @IsOptional() @IsNumber() @Min(0) bdlTaklef?: number;
  @IsOptional() @IsNumber() @Min(0) bdlMa3esha?: number;
}

export class CreateLoanRuleDto {
  @IsString() @IsNotEmpty() @MaxLength(255) title!: string;
  @IsInt() @Min(1) type!: number;
}

export class UpdateLoanRuleDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(255) title?: string;
  @IsOptional() @IsInt() @Min(1) type?: number;
}

export class CreateLoanAccountDto {
  @IsInt() @Min(1) empId!: number;
  @IsOptional() @IsInt() @Min(1) empCode?: number;
  @IsOptional() @IsString() @MaxLength(255) empName?: string;
  @IsString() @Matches(/^\d+$/) @MaxLength(30) accountNumber!: string;
  @IsString() @IsNotEmpty() @MaxLength(255) accountName!: string;
}

export class UpdateLoanAccountDto {
  @IsOptional() @IsInt() @Min(1) empId?: number;
  @IsOptional() @IsInt() @Min(1) empCode?: number;
  @IsOptional() @IsString() @MaxLength(255) empName?: string;
  @IsOptional() @IsString() @Matches(/^\d+$/) @MaxLength(30) accountNumber?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(255) accountName?: string;
}
