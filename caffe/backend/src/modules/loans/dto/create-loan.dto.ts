import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateLoanDto {
  @IsInt()
  empId!: number;

  @IsInt()
  @Min(1)
  amount!: number;

  @IsInt()
  @Min(1)
  installments!: number;

  @IsString()
  deductionStartDate!: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsInt()
  sadadSolfa?: number;

  @IsOptional()
  @IsInt()
  numPreviousRequests?: number;

  @IsOptional()
  @IsString()
  previousRequestDate?: string;
}
