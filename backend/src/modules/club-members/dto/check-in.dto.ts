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

  /** Stand-in captain for the scheduled class this check-in lands on. */
  @IsOptional()
  @Transform(({ value }) => (value != null && value !== '' ? Number(value) : undefined))
  @IsInt()
  classTrainerId?: number;
}

export class NextScheduledClassDto {
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
}

export class SetClassTrainerDto {
  @Transform(({ value }) => Number(value))
  @IsInt()
  classId!: number;

  @Transform(({ value }) => Number(value))
  @IsInt()
  trainerId!: number;
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

export class ResolvePendingSubscriptionDto {
  @Transform(({ value }) => Number(value))
  @IsInt()
  subscriptionId!: number;
}
