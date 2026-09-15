import { IsInt, IsOptional, IsString } from 'class-validator';

/** Faithful port of the legacy add_agaza form (Agzat_model::get_data_new). */
export class CreateLeaveDto {
  /** holiday_setting.id (no3_agaza). 3/4 are sick-leave types needing a hospital report. */
  @IsInt()
  leaveTypeId!: number;

  /** f2a_agaza: 1 طارئة (emergency), 2 عادية (normal), 3 بدون راتب (unpaid). */
  @IsOptional()
  @IsInt()
  f2aAgaza?: number;

  @IsOptional()
  @IsInt()
  empId?: number;

  /** Gregorian dates (yyyy-mm-dd). */
  @IsString()
  startDate!: string;

  @IsString()
  endDate!: string;

  /** Hijri date pair (optional, mirrors *_date_h columns). */
  @IsOptional()
  @IsString()
  startDateHijri?: string;

  @IsOptional()
  @IsString()
  endDateHijri?: string;

  /** Return-to-work date (mobashret_amal). */
  @IsOptional()
  @IsString()
  returnToWorkDate?: string;

  @IsOptional()
  @IsString()
  returnToWorkDateHijri?: string;

  /** Number of days (posted from client like legacy). Computed if omitted. */
  @IsOptional()
  @IsInt()
  numDays?: number;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  addressSinceAgaza?: string;

  @IsOptional()
  @IsString()
  empPhone?: string;

  /** Substitute employee (emp_badel) + pledge. Setting this routes via level=1 first. */
  @IsOptional()
  @IsInt()
  substituteEmpId?: number;

  @IsOptional()
  @IsString()
  pledge?: string;

  /** Sick-leave medical fields (no3_agaza 3/4). */
  @IsOptional()
  @IsString()
  maradName?: string;

  @IsOptional()
  @IsString()
  hospitalName?: string;

  @IsOptional()
  @IsString()
  hospitalReport?: string;

  @IsOptional()
  @IsString()
  taqrerFromDate?: string;

  @IsOptional()
  @IsString()
  taqrerToDate?: string;

  /** Death-degree (daraget_waffa). */
  @IsOptional()
  @IsString()
  daragetWaffa?: string;
}
