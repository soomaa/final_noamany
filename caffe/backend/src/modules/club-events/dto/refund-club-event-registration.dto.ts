import { Transform } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class RefundClubEventRegistrationDto {
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsIn(['cash', 'card', 'bank', 'online'])
  paymentMethod?: 'cash' | 'card' | 'bank' | 'online';
}
