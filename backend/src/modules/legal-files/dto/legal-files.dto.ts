import { IsInt, IsOptional, IsString, Matches } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ListLegalFilesDto extends PaginationDto {}

export class CreateLegalFileDto {
  @IsString()
  title!: string;

  /** Relative upload path returned by POST /api/uploads/legal (field "file"). */
  @IsOptional()
  @IsString()
  @Matches(/^file:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  file?: string;
}

export class UpdateLegalFileDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  @Matches(/^file:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
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
