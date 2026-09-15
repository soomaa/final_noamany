import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import { ListQueryDto } from '../../../common/dto/list-query.dto';

/**
 * List filters mirror legacy takrer_yawmi listing:
 *  - search → title/notes
 *  - status → 'inprogress' | 'done' (reuses ListQueryDto.status)
 *  - type   → for_month (numeric string)
 *  - date   → for_year (numeric string)
 */
export class ListDailyReportsDto extends ListQueryDto {}

export class CreateDailyReportDto {
  @IsInt()
  empId!: number;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsIn(['inprogress', 'done'])
  status?: 'inprogress' | 'done';

  @IsOptional()
  @Transform(({ value }) => (value === '' || value == null ? undefined : parseInt(value, 10)))
  @IsInt()
  forMonth?: number;

  @IsOptional()
  @Transform(({ value }) => (value === '' || value == null ? undefined : parseInt(value, 10)))
  @IsInt()
  forYear?: number;
}

export class UpdateDailyReportDto {
  @IsOptional()
  @IsInt()
  empId?: number;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsIn(['inprogress', 'done'])
  status?: 'inprogress' | 'done';

  @IsOptional()
  @Transform(({ value }) => (value === '' || value == null ? undefined : parseInt(value, 10)))
  @IsInt()
  forMonth?: number;

  @IsOptional()
  @Transform(({ value }) => (value === '' || value == null ? undefined : parseInt(value, 10)))
  @IsInt()
  forYear?: number;
}

/** Rejection carries the reviewer note stored in rad_notes (suspend → 2). */
export class RejectDailyReportDto {
  @IsOptional()
  @IsString()
  radNotes?: string;
}
