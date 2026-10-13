import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class UpdateMemberSubscriptionTransferDto {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  destinationMemberId?: number;

  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;
}
