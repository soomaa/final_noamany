import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

/** Assign (or re-assign) an employee's invitation code and monthly allowance. */
export class UpsertStaffInvitationCodeDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  employeeId!: number;

  /** Empty = the suggested code (NM + employee code). */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  code?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  monthlyQuota?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class UpdateStaffInvitationCodeDto {
  @IsOptional()
  @IsString()
  @MaxLength(30)
  code?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  monthlyQuota?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/** Quick +/− on this month's allowance. */
export class AdjustStaffInvitationQuotaDto {
  @Type(() => Number)
  @IsInt()
  @Min(-1000)
  @Max(1000)
  delta!: number;

  @IsString()
  @MinLength(3, { message: 'سبب التعديل مطلوب' })
  @MaxLength(500)
  reason!: string;
}

export class StaffInvitationReasonDto {
  @IsString()
  @MinLength(3, { message: 'السبب مطلوب' })
  @MaxLength(500)
  reason!: string;
}

export class GenerateStaffInvitationCodesDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  monthlyQuota?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  branchId?: number;

  /** Count only (for the confirmation), nothing is written. */
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

export class UpdateStaffInvitationSettingsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(365)
  duplicateWindowDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  defaultMonthlyQuota?: number;
}

/** «دعوة بكود موظف»: a guest who came through an employee's code. */
export class CreateStaffInvitationDto {
  /** The employee's code (typed or scanned) — or `employeeId` when picked from the list. */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  code?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  employeeId?: number;

  @IsString()
  @MinLength(2, { message: 'اسم الضيف مطلوب' })
  @MaxLength(200)
  guestName!: string;

  @IsString()
  @MaxLength(30)
  guestPhone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  /** YYYY-MM-DD; today when empty. */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  visitDate?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  branchId!: number;

  /** Record past the monthly allowance / the duplicate-phone window (permission + reason). */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  overrideReason?: string;

  @IsOptional()
  @IsBoolean()
  override?: boolean;
}

export class AddStaffInvitationNoteDto {
  @IsString()
  @MinLength(2, { message: 'اكتب الملاحظة' })
  @MaxLength(2000)
  note!: string;
}
