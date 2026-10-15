import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsObject, IsOptional, IsString, Matches, ValidateNested } from 'class-validator';

export class AttendanceRuleDto {
  @IsIn(['late', 'early_leave', 'absence', 'overtime', 'weekly_rest', 'holidays', 'flexible_hours'])
  key!: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsString() @Matches(/^\d+(?:\.\d+)?$/) threshold?: string;
  @IsOptional() @IsString() @Matches(/^\d+(?:\.\d+)?$/) graceMin?: string;
  @IsOptional() @IsString() @Matches(/^\d+(?:\.\d+)?$/) multiplier?: string;
}

export class UpdateAttendanceRulesDto {
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => AttendanceRuleDto)
  rules?: AttendanceRuleDto[];
}

export class UpdateAttendanceChannelsDto {
  @IsOptional() @IsObject() channels?: Record<string, boolean>;
}
