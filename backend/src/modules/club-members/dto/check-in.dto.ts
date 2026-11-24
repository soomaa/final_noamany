import { Transform, Type } from 'class-transformer';
import {
  IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateIf, ValidateNested,
} from 'class-validator';

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

  /** Reception scan: check the basic subscription in once a day; a second scan only reports it. */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  onceToday?: boolean;
}

export class InbodyResultDto {
  @IsOptional()
  @Transform(({ value }) => (value === '' || value == null ? undefined : Number(value)))
  @IsNumber({}, { message: 'الوزن غير صحيح' })
  @Min(20, { message: 'الوزن يجب أن يكون بين 20 و 300 كجم' })
  @Max(300, { message: 'الوزن يجب أن يكون بين 20 و 300 كجم' })
  weight?: number;

  @IsOptional()
  @Transform(({ value }) => (value === '' || value == null ? undefined : Number(value)))
  @IsNumber({}, { message: 'الطول غير صحيح' })
  @Min(50, { message: 'الطول يجب أن يكون بين 50 و 250 سم' })
  @Max(250, { message: 'الطول يجب أن يكون بين 50 و 250 سم' })
  heightCm?: number;

  @IsOptional()
  @Transform(({ value }) => (value === '' || value == null ? undefined : Number(value)))
  @IsNumber({}, { message: 'نسبة الدهون غير صحيحة' })
  @Min(0, { message: 'نسبة الدهون يجب أن تكون بين 0 و 100' })
  @Max(100, { message: 'نسبة الدهون يجب أن تكون بين 0 و 100' })
  bodyFat?: number;

  @IsOptional()
  @Transform(({ value }) => (value === '' || value == null ? undefined : Number(value)))
  @IsNumber({}, { message: 'كتلة العضلات غير صحيحة' })
  @Min(0, { message: 'كتلة العضلات يجب أن تكون بين 0 و 200 كجم' })
  @Max(200, { message: 'كتلة العضلات يجب أن تكون بين 0 و 200 كجم' })
  muscleMass?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  /** Stored upload path from POST /uploads/inbody. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reportUrl?: string;
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

  /**
   * InBody only: the session's result, saved with the deduction in one transaction
   * (reception's "خصم ورفع النتيجة"). Omit to deduct the session alone.
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => InbodyResultDto)
  measurement?: InbodyResultDto;
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
