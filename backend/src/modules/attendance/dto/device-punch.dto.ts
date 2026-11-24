import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class DevicePunchItemDto {
  /** "AC No" / user id typed on the device; must equal employees.emp_code. */
  @IsString()
  @MaxLength(32)
  userId!: string;

  /** Device local wall clock, "YYYY-MM-DD HH:mm:ss". */
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  time!: string;

  @IsOptional()
  @IsInt()
  state?: number;

  @IsOptional()
  @IsInt()
  verify?: number;
}

/** POST /attendance/device-agent/punches — batch pushed by the on-site ZKTeco agent. */
export class DevicePunchBatchDto {
  /** attendance_devices.id of the device these punches came from. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  deviceId!: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  serial?: string;

  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => DevicePunchItemDto)
  punches!: DevicePunchItemDto[];
}
