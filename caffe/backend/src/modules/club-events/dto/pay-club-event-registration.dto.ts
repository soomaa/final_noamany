import { Transform } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class PayClubEventRegistrationDto {
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsIn(['cash', 'card', 'bank', 'online'])
  paymentMethod?: 'cash' | 'card' | 'bank' | 'online';

  @IsString()
  idempotencyKey!: string;

  @IsOptional()
  @IsString()
  description?: string;
}
