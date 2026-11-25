import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

const toBool = ({ value }: { value: unknown }) =>
  value == null || value === '' ? undefined : !(value === false || value === 'false' || value === '0' || value === 0);

/** The message part shared by send / test / schedules. */
export class PushMessageDto {
  @IsString() @MaxLength(120) title!: string;
  @IsString() @MaxLength(600) body!: string;
  @IsOptional() @IsString() @MaxLength(40) type?: string;
  @IsOptional() @IsString() @MaxLength(500) link?: string;
  @IsOptional() @IsString() @MaxLength(500) imageUrl?: string;
}

export class PushAudienceRequestDto {
  /** { kind, branchIds?, gender?, days?, memberIds? } — validated by normalizeAudience(). */
  @IsObject() audience!: Record<string, unknown>;
}

export class PushSendDto extends PushMessageDto {
  @IsObject() audience!: Record<string, unknown>;
  /** Also save it in the app's notifications list (am_member_notifications). Default true. */
  @IsOptional() @Transform(toBool) @IsBoolean() inApp?: boolean;
  /** Send even inside quiet hours. */
  @IsOptional() @Transform(toBool) @IsBoolean() force?: boolean;
}

export class PushTestDto extends PushMessageDto {
  @Transform(({ value }) => (value != null && value !== '' ? parseInt(value, 10) : undefined))
  @IsInt() memberId!: number;
}

export class PushCampaignDto extends PushMessageDto {
  @IsString() @MaxLength(150) name!: string;
  @IsOptional() @IsString() @MaxLength(40) preset?: string;
  @IsObject() audience!: Record<string, unknown>;
  /** { kind, runAt?, time?, weekdays?, monthDay?, intervalDays?, startDate?, endDate? } */
  @IsObject() schedule!: Record<string, unknown>;
  @IsOptional() @Transform(toBool) @IsBoolean() inApp?: boolean;
}

export class ListPushSendsDto extends PaginationDto {
  @IsOptional() @IsIn(['manual', 'schedule', 'test']) trigger?: string;
  @IsOptional() @Transform(({ value }) => (value != null && value !== '' ? parseInt(value, 10) : undefined))
  @IsInt() campaignId?: number;
}

export class PushSettingsDto {
  @IsOptional() @Transform(toBool) @IsBoolean() quietEnabled?: boolean;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) quietStart?: string;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) quietEnd?: string;
  @IsOptional() @IsIn(['defer', 'skip']) quietMode?: 'defer' | 'skip';
  @IsOptional() @IsString() @MaxLength(40) defaultType?: string;
  @IsOptional() @Transform(({ value }) => (value != null && value !== '' ? parseInt(value, 10) : undefined))
  @IsInt() @Min(0) @Max(50) dailyLimit?: number;
}

export class PushOpenedDto {
  @Transform(({ value }) => (value != null && value !== '' ? parseInt(value, 10) : undefined))
  @IsInt() sendId!: number;
}
