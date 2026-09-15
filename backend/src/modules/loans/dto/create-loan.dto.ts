import { IsDateString, IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

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
  @IsDateString()
  deductionStartDate!: string;

  @IsOptional()
  @IsString()
  @IsDateString()
  requestDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  reason?: string;

  @IsInt()
  @IsIn([1, 2, 3])
  sadadSolfa!: number;

  @IsOptional()
  @IsInt()
  numPreviousRequests?: number;

  @IsOptional()
  @IsString()
  previousRequestDate?: string;
}
