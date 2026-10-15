import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString } from 'class-validator';

export class ScanClubEventCheckinDto {
  @IsString()
  code!: string;

  @Transform(({ value }) => Number(value))
  @IsInt()
  eventId!: number;

  @IsOptional()
  @Transform(({ value }) => (value != null && value !== '' ? Number(value) : undefined))
  @IsInt()
  sessionId?: number;
}

export class MemberClubEventCheckinDto {
  @IsString()
  memberCode!: string;

  @Transform(({ value }) => Number(value))
  @IsInt()
  eventId!: number;

  @IsOptional()
  @Transform(({ value }) => (value != null && value !== '' ? Number(value) : undefined))
  @IsInt()
  sessionId?: number;
}
