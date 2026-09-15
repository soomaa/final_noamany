import { IsInt, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ListLegalFilesDto extends PaginationDto {}

export class CreateLegalFileDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  details?: string;

  /** Relative upload path returned by POST /api/uploads/legal (field "file"). */
  @IsOptional()
  @IsString()
  file?: string;
}

export class UpdateLegalFileDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  details?: string;

  @IsOptional()
  @IsString()
  file?: string;
}

/**
 * Acknowledge ("تأكيد الاطلاع") a legal file for the current user.
 * emp_id_fk is optional — legacy stores the acting employee where known.
 */
export class AckLegalFileDto {
  @IsOptional()
  @IsInt()
  empId?: number;
}
