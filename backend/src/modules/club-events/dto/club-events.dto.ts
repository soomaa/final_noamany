import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

const KINDS = ['competition','challenge','workshop','bootcamp','seminar','open_day','community','kids_activity','campaign'] as const;
const STATUSES = ['draft','pending_approval','approved','rejected','published','ongoing','completed','closed','cancelled'] as const;
const VISIBILITIES = ['internal','members','public'] as const;

export class ListClubEventsDto extends PaginationDto {
  @IsOptional() @IsIn(KINDS) kind?: string;
  @IsOptional() @IsIn(STATUSES) status?: string;
  @IsOptional() @IsIn(VISIBILITIES) visibility?: string;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() branchId?: number;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() categoryId?: number;
  @IsOptional() @IsString() dateFrom?: string;
  @IsOptional() @IsString() dateTo?: string;
}

export class CreateClubEventDto {
  @IsString() @MaxLength(200) title!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() @MaxLength(255) cover_image?: string;
  @Transform(({ value }) => Number(value)) @IsInt() category_id!: number;
  @IsIn(KINDS) kind!: string;
  @Transform(({ value }) => Number(value)) @IsInt() branch_id!: number;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() hall_id?: number;
  @IsOptional() @IsString() @MaxLength(200) venue_name?: string;
  @IsString() @MaxLength(10) start_date!: string;
  @IsString() @MaxLength(10) end_date!: string;
  @IsOptional() @IsString() @MaxLength(8) start_time?: string;
  @IsOptional() @IsString() @MaxLength(8) end_time?: string;
  @IsOptional() @IsString() @MaxLength(10) registration_opens?: string;
  @IsOptional() @IsString() @MaxLength(10) registration_closes?: string;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(0) max_capacity?: number;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(0) waitlist_capacity?: number;
  @IsOptional() @IsIn(VISIBILITIES) visibility?: string;
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true || value === 1) @IsBoolean() is_free?: boolean;
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true || value === 1) @IsBoolean() allow_guests?: boolean;
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true || value === 1) @IsBoolean() requires_active_subscription?: boolean;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(0) min_age?: number;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(0) max_age?: number;
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true || value === 1) @IsBoolean() requires_guardian_consent?: boolean;
  @IsOptional() @IsString() @MaxLength(100) campaign_tag?: string;
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true || value === 1) @IsBoolean() show_in_app?: boolean;
}

export class UpdateClubEventDto {
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() @MaxLength(255) cover_image?: string;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() category_id?: number;
  @IsOptional() @IsIn(KINDS) kind?: string;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() branch_id?: number;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() hall_id?: number;
  @IsOptional() @IsString() @MaxLength(200) venue_name?: string;
  @IsOptional() @IsString() @MaxLength(10) start_date?: string;
  @IsOptional() @IsString() @MaxLength(10) end_date?: string;
  @IsOptional() @IsString() @MaxLength(8) start_time?: string;
  @IsOptional() @IsString() @MaxLength(8) end_time?: string;
  @IsOptional() @IsString() @MaxLength(10) registration_opens?: string;
  @IsOptional() @IsString() @MaxLength(10) registration_closes?: string;
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true || value === 1) @IsBoolean() registration_paused?: boolean;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(0) max_capacity?: number;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(0) waitlist_capacity?: number;
  @IsOptional() @IsIn(VISIBILITIES) visibility?: string;
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true || value === 1) @IsBoolean() is_free?: boolean;
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true || value === 1) @IsBoolean() allow_guests?: boolean;
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true || value === 1) @IsBoolean() requires_active_subscription?: boolean;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(0) min_age?: number;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(0) max_age?: number;
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true || value === 1) @IsBoolean() requires_guardian_consent?: boolean;
  @IsOptional() @IsString() @MaxLength(100) campaign_tag?: string;
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true || value === 1) @IsBoolean() show_in_app?: boolean;
}

export class TransitionEventStatusDto {
  @IsIn(STATUSES) status!: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}
