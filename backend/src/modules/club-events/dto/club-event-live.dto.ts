import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export type UpdateEventDisplaySettingsDto = Record<string, unknown>;

const SEGMENT_KINDS = ['text', 'image', 'gallery', 'video'] as const;

export class ProgramSegmentListQuery {
  @IsOptional()
  @IsString()
  onlyEnabled?: string;
}

export class CreateProgramSegmentDto {
  @IsString() @MinLength(1) @MaxLength(300) title!: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsIn(SEGMENT_KINDS as unknown as string[]) kind?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) mediaUrls?: string[];
  @IsOptional() @IsString() videoUrl?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) durationSeconds?: number;
  @IsOptional() @Type(() => Number) @IsInt() orderIndex?: number;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsString() scheduledTime?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() durationMinutes?: number | null;
  @IsOptional() @IsBoolean() showDuration?: boolean;
}

export class UpdateProgramSegmentDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(300) title?: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsIn(SEGMENT_KINDS as unknown as string[]) kind?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) mediaUrls?: string[];
  @IsOptional() @IsString() videoUrl?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) durationSeconds?: number;
  @IsOptional() @Type(() => Number) @IsInt() orderIndex?: number;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsString() scheduledTime?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() durationMinutes?: number | null;
  @IsOptional() @IsBoolean() showDuration?: boolean;
}

export class GuestLiveCheckinDto {
  @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @IsString() @MinLength(8) @MaxLength(20) phone!: string;
  @IsOptional()
  @Transform(({ value }) => (value == null || value === '' ? undefined : String(value)))
  @IsString()
  @MaxLength(50)
  title?: string;
  @IsOptional()
  @Transform(({ value }) => (value == null || value === '' ? undefined : String(value)))
  @IsString()
  source?: string;
}

export class GuestByPhoneQuery {
  @IsString() @MinLength(8) phone!: string;
}

export { SEGMENT_KINDS };
