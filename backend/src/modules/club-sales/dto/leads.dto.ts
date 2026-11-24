import { OmitType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  IsEmail,
  Matches,
} from 'class-validator';
import { LEAD_ACTIVITY_TYPES, LEAD_SOURCES, LEAD_STATUSES } from '../club-sales.constants';
import { parseOptionalGuestAge } from '../invitation-package.util';

const toInt = ({ value }: { value: unknown }) =>
  value != null && value !== '' ? Number(value) : undefined;

export class ListLeadsDto {
  @IsOptional()
  @IsString()
  search?: string;

  /** `open` = still being worked (FIT90's default list); `following` = not converted/lost. */
  @IsOptional()
  @IsIn([...LEAD_STATUSES, 'all', 'following', 'open', ''])
  status?: string;

  @IsOptional()
  @IsIn([...LEAD_SOURCES, 'all', ''])
  source?: string;

  /** «مصدر المعرفة» filter (club_customer_sources.id). */
  @Transform(toInt)
  @IsOptional()
  @IsInt()
  sourceId?: number;

  @Transform(toInt)
  @IsOptional()
  @IsInt()
  assignedToId?: number;

  @Transform(toInt)
  @IsOptional()
  @IsInt()
  branchId?: number;

  @IsOptional()
  @IsIn(['mine', 'unassigned', 'all', ''])
  scope?: string;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;

  @Transform(toInt)
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @Transform(toInt)
  @IsOptional()
  @IsInt()
  @Min(1)
  pageSize?: number;
}

export class UpsertLeadDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  fullName!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(50)
  phone!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(120)
  email?: string;

  /** EMS's fixed source key. Optional since the ported form picks «مصدر المعرفة» instead. */
  @IsOptional()
  @IsIn([...LEAD_SOURCES])
  source?: string;

  /** Set by hand from the potential-members form; `converted` belongs to the conversion flow. */
  @IsOptional()
  @IsIn(LEAD_STATUSES.filter((status) => status !== 'converted'))
  status?: string;

  /** Date-only follow-up (YYYY-MM-DD), mirrored into the workspace's timed reminder. */
  @IsOptional()
  @ValidateIf((_, value) => value !== '' && value != null)
  @IsDateString()
  followUpAt?: string | null;

  /** «مصدر المعرفة» — an entry from the admin-managed club_customer_sources list. */
  @Transform(({ value }) => {
    if (value === '' || value === undefined) return undefined;
    if (value === null) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : value;
  })
  @IsOptional()
  @ValidateIf((_, value) => value != null)
  @IsInt()
  sourceId?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  facebookProfileUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  interestedProgram?: string;

  @Transform(toInt)
  @IsOptional()
  @IsInt()
  subscriptionTypeId?: number;

  @Transform(({ value }) => {
    if (value === '' || value === undefined) return undefined;
    if (value === null) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : value;
  })
  @IsOptional()
  @ValidateIf((_, value) => value != null)
  @IsInt()
  assignedToId?: number | null;

  @IsOptional()
  @IsIn(['manual', 'automatic'])
  assignmentMode?: 'manual' | 'automatic';

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  branchId!: number;
}

/** New leads always start as `new`; status changes belong to sales follow-ups. */
export class CreateLeadDto extends UpsertLeadDto {}

/** A contact outcome from the potential-members screen — one of LEAD_FEEDBACK_OPTIONS. */
export class LeadFeedbackDto {
  @IsString()
  @MaxLength(40)
  feedback!: string;

  /** The call-back or visit date, `YYYY-MM-DD`. Required by some outcomes. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  date?: string;

  /** What was said, kept with the outcome so the next rep has the context. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class FollowUpLeadDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  note?: string;

  @IsOptional()
  @IsIn([...LEAD_STATUSES])
  status?: string;

  @IsOptional()
  @IsIn([...LEAD_ACTIVITY_TYPES])
  activityType?: string;

  @IsOptional()
  @IsBoolean()
  answered?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  interests?: string;

  @IsOptional()
  @IsDateString()
  nextFollowUpAt?: string;

  @IsOptional()
  @IsDateString()
  nextCallAt?: string;
}

export class AssignLeadDto {
  @Transform(toInt)
  @IsOptional()
  @IsInt()
  assignedToId?: number;

  @IsOptional()
  @IsIn(['manual', 'automatic'])
  assignmentMode?: 'manual' | 'automatic';
}

export class ReassignLeadDto {
  @Transform(toInt)
  @IsInt()
  @Min(1)
  assignedToId!: number;
}

export class DashboardQueryDto {
  @IsOptional()
  @IsIn(['today', 'week', 'month', 'custom'])
  range?: string;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;

  @Transform(toInt)
  @IsOptional()
  @IsInt()
  branchId?: number;

  @Transform(toInt)
  @IsOptional()
  @IsInt()
  salesRepId?: number;
}

export class CreateInvitationDto {
  @Transform(toInt)
  @IsInt()
  @Min(1)
  subscriptionId!: number;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  guestName!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(50)
  guestPhone!: string;

  @Transform(({ value }) => parseOptionalGuestAge(value))
  @IsOptional()
  @IsInt()
  @Min(1)
  guestAge?: number;
}

export class CommissionTierDto {
  // Every number below needs a real validator, not just @Type: the global pipe whitelists
  // by validation metadata and silently drops whatever has none.
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minAchievementPct!: number;

  @IsOptional()
  @Type(() => Number)
  maxAchievementPct?: number | null;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  commissionPercent!: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  label?: string;
}

export class UpsertSalesRepSettingsDto {
  @IsOptional()
  @IsBoolean()
  useDefaultSettings?: boolean;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  employeeId!: number;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  branchIds?: number[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  monthlyTarget!: number;

  @IsOptional()
  @IsIn(['monthly', 'custom', 'days'])
  targetPeriodMode?: 'monthly' | 'custom' | 'days';

  @IsOptional()
  @IsString()
  targetStartDate?: string;

  @IsOptional()
  @IsString()
  targetEndDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  targetDays?: number;

  @IsIn(['flat', 'tiered'])
  commissionMode!: 'flat' | 'tiered';

  @IsOptional()
  @Type(() => Number)
  flatCommissionPercent?: number;

  @IsOptional()
  @Type(() => CommissionTierDto)
  tiers?: CommissionTierDto[];
}

export class SalesDefaultsDto extends OmitType(UpsertSalesRepSettingsDto, ['employeeId', 'branchIds', 'isActive', 'useDefaultSettings'] as const) {}

export class SalesActivationDto {
  @IsBoolean()
  isActive!: boolean;

  @IsOptional()
  @IsIn(['auto', 'manual'])
  mode?: 'auto' | 'manual';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  targetEmployeeId?: number;
}

export class UpsertTrainerCommissionDto {
  /** session_tiered: each completed session pays the tier percent reached against the target. */
  @IsOptional()
  @IsIn(['attendance', 'tiered', 'combined', 'session_tiered'])
  commissionMode?: 'attendance' | 'tiered' | 'combined' | 'session_tiered';

  /** session_tiered: what the target measures, and which amounts reduce it. */
  @IsOptional() @IsIn(['sales', 'collections']) targetBasis?: 'sales' | 'collections';
  @IsOptional() @IsBoolean() deductRefunds?: boolean;
  @IsOptional() @IsBoolean() deductDiscounts?: boolean;

  /** First day the saved policy applies (default: start of the current month). Earlier periods keep their version. */
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) effectiveFrom?: string;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  employeeId!: number;

  @Transform(toInt)
  @IsOptional()
  @IsInt()
  trainerId?: number;

  @IsIn(['members', 'money'])
  targetUnit!: 'members' | 'money';

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  baseTarget!: number;

  @IsOptional()
  @IsIn(['monthly', 'custom', 'days'])
  targetPeriodMode?: 'monthly' | 'custom' | 'days';

  @IsOptional()
  @IsString()
  targetStartDate?: string;

  @IsOptional()
  @IsString()
  targetEndDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  targetDays?: number;

  @IsOptional()
  @Type(() => CommissionTierDto)
  tiers?: CommissionTierDto[];

  /** Follow the house defaults instead of freezing a copy of them on this trainer. */
  @IsOptional()
  @IsBoolean()
  useDefaultSettings?: boolean;
}

/** The house trainer setup: the same fields, minus whose they are. */
export class TrainerDefaultsDto extends OmitType(UpsertTrainerCommissionDto, [
  'employeeId',
  'trainerId',
  'useDefaultSettings',
  'targetBasis',
  'deductRefunds',
  'deductDiscounts',
  'effectiveFrom',
] as const) {}

export class CompleteLeadReminderDto {
  @IsIn(['call', 'follow_up'])
  kind!: 'call' | 'follow_up';

  @IsDateString()
  dueAt!: string;
}

/** POST /guest/leads — a guest in the member app asks to be contacted about one package. */
export class CreateGuestLeadDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  fullName!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(50)
  phone!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  branchId!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  subscriptionTypeId!: number;
}
