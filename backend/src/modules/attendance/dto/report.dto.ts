import { IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

/**
 * Shared filter for the attendance reports (basma / late / absence / overtime / swap).
 * Mirrors the legacy date-range + employee + branch filters used in Hdoor_m reports.
 */
export class AttendanceReportDto extends PaginationDto {
  /** employees.emp_code or 'all' */
  @IsOptional()
  @IsString()
  empCode?: string;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;

  /** employees.branch_id_fk or 'all' */
  @IsOptional()
  @IsString()
  branchId?: string;
}
