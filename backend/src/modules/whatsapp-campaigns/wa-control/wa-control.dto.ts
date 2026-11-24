import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Length, Matches, Max, MaxLength, Min } from 'class-validator';

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class WaClientSettingsDto {
  @IsOptional() @IsString() @Length(1, 160) name?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100000) dailyLimit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(3000000) monthlyLimit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(3) @Max(3600) minDelaySec?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(3) @Max(3600) maxDelaySec?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1000) pauseEvery?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(7200) pauseSec?: number;
  @IsOptional() @Matches(HHMM) sendFrom?: string;
  @IsOptional() @Matches(HHMM) sendTo?: string;
  @IsOptional() @IsString() @MaxLength(40) timezone?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class CreateWaClientDto extends WaClientSettingsDto {
  @IsString() @Length(1, 160) declare name: string;
}

export class WaTenantSubscriptionDto {
  @IsBoolean() subscribed!: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(3000000) monthlyLimit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100000) dailyLimit?: number;
}

export class WaSelectorsDto {
  @IsObject() selectors!: Record<string, string>;
}

export class WaPermitRequestDto {
  @IsString() @Length(8, 80) senderId!: string;
  @IsOptional() @IsString() @MaxLength(160) senderLabel?: string;
  @IsOptional() @Matches(/^\d{1,4}$/) phoneTail?: string;
  @IsOptional() @IsString() @MaxLength(80) ref?: string;
}

export class WaPermitResultDto {
  @IsIn(['sent', 'failed', 'uncertain']) status!: 'sent' | 'failed' | 'uncertain';
  @IsOptional() @IsString() @MaxLength(80) reason?: string;
}

export class WaReleaseDto {
  @IsString() @Length(8, 80) senderId!: string;
}
