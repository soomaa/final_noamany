import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Min, ValidateIf } from 'class-validator';

export class CheckInDto {
  @IsOptional()
  @IsIn(['normal', 'class'])
  attendanceType?: 'normal' | 'class';
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

export class ServiceCheckInDto {
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  memberId: number;

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  subscriptionId: number;

  @IsIn(['class', 'spa', 'inbody'])
  attendanceType: 'class' | 'spa' | 'inbody';
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
