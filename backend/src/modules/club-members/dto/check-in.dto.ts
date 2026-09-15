import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, ValidateIf } from 'class-validator';

export class CheckInDto {
  @ValidateIf((o) => !o.memberCode)
  @Transform(({ value }) => (value != null ? Number(value) : undefined))
  @IsInt()
  memberId?: number;

  @ValidateIf((o) => !o.memberId)
  @IsString()
  memberCode?: string;

  @IsOptional()
  @Transform(({ value }) => (value != null && value !== '' ? Number(value) : undefined))
  @IsInt()
  branchId?: number;

  @IsOptional()
  @Transform(({ value }) => (value != null && value !== '' ? Number(value) : undefined))
  @IsInt()
  subscriptionId?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  force?: boolean;

  @IsOptional()
  @IsString()
  overrideReason?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  consumeSession?: boolean;
}

export class CheckOutDto {
  @IsOptional()
  @Transform(({ value }) => (value != null ? Number(value) : undefined))
  @IsInt()
  memberId?: number;

  @IsOptional()
  @IsString()
  memberCode?: string;

  @IsOptional()
  @Transform(({ value }) => (value != null ? Number(value) : undefined))
  @IsInt()
  attendanceId?: number;
}
