import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateLeaveTypeDto {
  @IsString() @IsNotEmpty() @MaxLength(300) title!: string;
  @IsOptional() @IsInt() @Min(0) @Max(366) minDays?: number;
  @IsOptional() @IsInt() @Min(0) @Max(366) maxDays?: number;
  @IsOptional() @IsInt() @Min(0) agazaTtype?: number;
  @IsOptional() @IsBoolean() hasSubstitute?: boolean;
  @IsOptional() @IsBoolean() isPaid?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateLeaveTypeDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(300) title?: string;
  @IsOptional() @IsInt() @Min(0) @Max(366) minDays?: number;
  @IsOptional() @IsInt() @Min(0) @Max(366) maxDays?: number;
  @IsOptional() @IsInt() @Min(0) agazaTtype?: number;
  @IsOptional() @IsBoolean() hasSubstitute?: boolean;
  @IsOptional() @IsBoolean() isPaid?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CarryOverLeaveDto {
  @IsOptional() @IsInt() @Min(2000) @Max(2200) year?: number;
}
