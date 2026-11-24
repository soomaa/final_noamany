import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { EXIT_TYPES, ExitType } from '../exit-types';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class ListExitsDto extends PaginationDto {
  @IsOptional()
  @IsIn(EXIT_TYPES as unknown as string[])
  exitType?: ExitType;

  @IsOptional()
  @Transform(({ value }) => (value === '' || value == null ? undefined : parseInt(value, 10)))
  @IsInt()
  empId?: number;
}

export class CreateExitDto {
  @IsInt()
  empId!: number;

  @IsIn(EXIT_TYPES as unknown as string[], { message: 'نوع انتهاء الخدمة غير صالح' })
  exitType!: ExitType;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  @Matches(ISO_DATE, { message: 'تاريخ الإخطار غير صالح' })
  noticeGivenDate?: string | null;

  @Matches(ISO_DATE, { message: 'تاريخ آخر يوم عمل غير صالح' })
  lastWorkingDate!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  requiredNoticeDays?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  settlementNotes?: string;
}
