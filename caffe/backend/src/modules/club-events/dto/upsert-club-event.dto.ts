import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

const KINDS = [
  'competition',
  'challenge',
  'workshop',
  'bootcamp',
  'seminar',
  'open_day',
  'community',
  'kids_activity',
  'campaign',
];

const VISIBILITIES = ['internal', 'members', 'public'];

/**
 * Create/update payload. Deliberately omits `status` — status is exclusively mutated through
 * POST /:id/status so the generic PATCH can never bypass the approval gate (Part IV §a).
 */
export class UpsertClubEventDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  coverImage?: string;

  @IsOptional()
  @Transform(({ value }) => (value != null ? Number(value) : undefined))
  @IsInt()
  categoryId?: number;

  @IsOptional()
  @IsIn(KINDS)
  kind?: string;

  @IsOptional()
  @Transform(({ value }) => (value != null ? Number(value) : undefined))
  @IsInt()
  branchId?: number;

  @IsOptional()
  @Transform(({ value }) => (value != null ? Number(value) : undefined))
  @IsInt()
  hallId?: number;

  @IsOptional()
  @IsString()
  venueName?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsString()
  startTime?: string;

  @IsOptional()
  @IsString()
  endTime?: string;

  @IsOptional()
  @IsString()
  registrationOpens?: string;

  @IsOptional()
  @IsString()
  registrationCloses?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === 1)
  @IsBoolean()
  registrationPaused?: boolean;

  @IsOptional()
  @Transform(({ value }) => (value != null ? Number(value) : undefined))
  @IsInt()
  @Min(0)
  maxCapacity?: number;

  @IsOptional()
  @Transform(({ value }) => (value != null ? Number(value) : undefined))
  @IsInt()
  @Min(0)
  waitlistCapacity?: number;

  @IsOptional()
  @IsIn(VISIBILITIES)
  visibility?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === 1)
  @IsBoolean()
  isFree?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === 1)
  @IsBoolean()
  allowGuests?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === 1)
  @IsBoolean()
  requiresActiveSubscription?: boolean;

  @IsOptional()
  @Transform(({ value }) => (value != null ? Number(value) : undefined))
  @IsInt()
  minAge?: number;

  @IsOptional()
  @Transform(({ value }) => (value != null ? Number(value) : undefined))
  @IsInt()
  maxAge?: number;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === 1)
  @IsBoolean()
  requiresGuardianConsent?: boolean;

  @IsOptional()
  @IsString()
  campaignTag?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === 1)
  @IsBoolean()
  showInApp?: boolean;
}
