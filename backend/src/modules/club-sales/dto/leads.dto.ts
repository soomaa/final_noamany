import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { LEAD_ACTIVITY_TYPES, LEAD_SOURCES, LEAD_STATUSES } from '../club-sales.constants';
import { parseOptionalGuestAge } from '../invitation-package.util';

const toInt = ({ value }: { value: unknown }) =>
  value != null && value !== '' ? Number(value) : undefined;

export class ListLeadsDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn([...LEAD_STATUSES, 'all', 'following', ''])
  status?: string;

  @IsOptional()
  @IsIn([...LEAD_SOURCES, 'all', ''])
  source?: string;

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

  @IsIn([...LEAD_SOURCES])
  source!: string;

  @ValidateIf((dto: UpsertLeadDto) => dto.source === 'facebook_campaign')
  @IsString()
  @MinLength(4)
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

export class CompleteLeadReminderDto {
  @IsIn(['call', 'follow_up'])
  kind!: 'call' | 'follow_up';

  @IsDateString()
  dueAt!: string;
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

export class CommissionTierDto {
  @Type(() => Number)
  minAchievementPct!: number;

  @IsOptional()
  @Type(() => Number)
  maxAchievementPct?: number | null;

  @Type(() => Number)
  commissionPercent!: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  label?: string;
}

export class UpsertSalesRepSettingsDto {
  @Transform(toInt)
  @IsInt()
  @Min(1)
  employeeId!: number;

  @IsOptional()
  @IsBoolean()
  useDefaults?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  branchIds?: number[];

  @Type(() => Number)
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

export class UpsertSalesDefaultsDto {
  @Type(() => Number)
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

export class SetSalesRepActiveDto {
  @IsBoolean()
  isActive!: boolean;

  @Transform(toInt)
  @IsOptional()
  @IsInt()
  @Min(1)
  transferToId?: number;
}

export class UpsertTrainerCommissionDto {
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
  baseTarget!: number;

  @IsOptional()
  @IsIn(['attendance', 'tiered', 'combined'])
  commissionMode?: 'attendance' | 'tiered' | 'combined';

  @IsOptional()
  @IsIn(['salary', 'fixed'])
  privateCommissionMode?: 'salary' | 'fixed';

  @IsOptional()
  @Type(() => Number)
  privateCommissionPercent?: number;

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
}
