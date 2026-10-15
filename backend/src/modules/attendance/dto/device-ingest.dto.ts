import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class AttendanceDeviceEventDto {
  @IsString() @MaxLength(120) @Matches(/^[A-Za-z0-9._:-]+$/)
  eventId!: string;

  @IsString() @Matches(/^\d{1,10}$/)
  empCode!: string;

  @IsISO8601({ strict: true })
  occurredAt!: string;

  @IsIn(['in', 'out'])
  type!: 'in' | 'out';
}

export class AttendanceDeviceEventBatchDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500)
  @ValidateNested({ each: true }) @Type(() => AttendanceDeviceEventDto)
  events!: AttendanceDeviceEventDto[];
}
