import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator';

export class TransferSubscriptionToMemberDto {
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  sourceSubscriptionId!: number;

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  destinationMemberId!: number;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveDate?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;
}
