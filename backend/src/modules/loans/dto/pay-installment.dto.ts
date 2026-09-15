import { IsOptional, IsString } from 'class-validator';

export class PayInstallmentDto {
  /** Person who performed the disbursement (optional, stored on the quest). */
  @IsOptional()
  @IsString()
  paidBy?: string;
}
