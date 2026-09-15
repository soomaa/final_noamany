import { Transform } from 'class-transformer';
import { IsInt, IsString, MaxLength, Min } from 'class-validator';

export class AdjustClubMemberPointsDto {
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(-100000)
  points!: number;

  @Transform(({ value }) => String(value ?? '').trim())
  @IsString()
  @MaxLength(255)
  reason!: string;
}
