import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export const BARCODE_REPORT_KINDS = ['member', 'class', 'spa'] as const;
export type BarcodeReportKind = (typeof BARCODE_REPORT_KINDS)[number];

export class BarcodeAttendanceReportDto extends PaginationDto {
  @IsIn(BARCODE_REPORT_KINDS)
  kind!: BarcodeReportKind;

  @IsOptional()
  @IsString()
  branch?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateFrom?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateTo?: string;
}
