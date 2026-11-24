import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class WaTemplateFieldDto {
  @IsString() @MaxLength(60) label!: string;
  @IsArray() @ArrayMaxSize(8) @IsString({ each: true }) @MaxLength(500, { each: true }) options!: string[];
}

export class UpsertWaTemplateDto {
  @IsString() @Length(1, 120) name!: string;
  @IsString() @Length(1, 4000) body!: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  /** false = this template's messages go out without the automatic «ابعت إيقاف» line. */
  @IsOptional() @IsBoolean() addOptOutLine?: boolean;
  /** The template as fields (one line each, several wordings); the body is generated from them. */
  @IsOptional() @IsArray() @ArrayMaxSize(12) @ValidateNested({ each: true }) @Type(() => WaTemplateFieldDto) fields?: WaTemplateFieldDto[];
}

/** «لم يحضر منذ مدة»: when a check-in row turns yellow / red, and which template the WhatsApp button uses. */
export class WaAbsenceSettingsDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) yellowDays?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) redDays?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) templateId?: number;
}

export class WaAbsenceLookupDto {
  /** Comma-separated member ids from one page of the attendance list. */
  @Matches(/^\d+(,\d+){0,199}$/) members!: string;
  /** The day the members checked in (default: today, Cairo). */
  @IsOptional() @Matches(DATE) date?: string;
}

export class WaAudienceDto {
  @Type(() => Number) @IsInt() @Min(1) branchId!: number;
  @IsIn(['expired', 'expiring', 'members', 'birthdays']) source!: 'expired' | 'expiring' | 'members' | 'birthdays';
  /** expired: end date range (inclusive). */
  @IsOptional() @Matches(DATE) expiredFrom?: string;
  @IsOptional() @Matches(DATE) expiredTo?: string;
  /** expiring: ends from today up to N days ahead. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(90) withinDays?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(5000) @Type(() => Number) @IsInt({ each: true }) memberIds?: number[];
  /** birthdays: only members holding a subscription that has not ended yet. */
  @IsOptional() @IsBoolean() activeOnly?: boolean;
  @IsOptional() @IsIn(['male', 'female']) gender?: 'male' | 'female';
  @IsOptional() @IsString() @MaxLength(150) packageName?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(5000) @Type(() => Number) @IsInt({ each: true }) excludeMemberIds?: number[];
  @IsString() @Length(1, 4000) body!: string;
  /** The template the text came from (its options apply, e.g. no opt-out line). */
  @IsOptional() @Type(() => Number) @IsInt() templateId?: number;
}

export class CreateWaCampaignDto extends WaAudienceDto {
  @IsString() @Length(1, 160) name!: string;
  @IsOptional() @IsBoolean() start?: boolean;
}

/** Daily birthday greetings (one campaign per branch with a paired sending device). */
export class WaBirthdaySettingsDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  /** Cairo time the day's greetings are queued, HH:MM. */
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) time?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) templateId?: number;
  @IsOptional() @IsBoolean() activeOnly?: boolean;
}

export class ListWaCampaignsDto extends PaginationDto {
  @IsOptional() @IsString() branch?: string;
  @IsOptional() @IsString() status?: string;
}

export class ListWaMessagesDto extends PaginationDto {
  @IsOptional() @IsIn(['queued', 'sending', 'sent', 'failed', 'uncertain', 'skipped', 'cancelled']) status?: string;
}

export class CreateWaDeviceDto {
  @Type(() => Number) @IsInt() @Min(1) branchId!: number;
  @IsString() @Length(1, 120) label!: string;
}

export class WaOptOutDto {
  @IsString() @Length(6, 24) phone!: string;
  @IsOptional() @IsString() @MaxLength(200) reason?: string;
}

// ── extension ────────────────────────────────────────────────────────────────

export class WaPairDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/[\s-]/g, '').toUpperCase() : value))
  @Matches(/^[A-Z0-9]{8}$/)
  code!: string;
}

export class WaNextDto {
  @IsOptional() @Type(() => Number) @IsInt() campaignId?: number;
}

export class WaStopReplyDto {
  @IsString() @Length(6, 32) phone!: string;
  @IsString() @MaxLength(200) text!: string;
}

export class WaResultDto {
  @IsIn(['sent', 'failed', 'uncertain']) status!: 'sent' | 'failed' | 'uncertain';
  @IsOptional() @IsString() @MaxLength(80) reason?: string;
}
