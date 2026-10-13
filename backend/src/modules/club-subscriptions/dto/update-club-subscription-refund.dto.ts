import { Transform } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

export class UpdateClubSubscriptionRefundDto {
  @Transform(({ value }) => Number(value))
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  refundAmount!: number;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  refundDate!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  stopDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}
