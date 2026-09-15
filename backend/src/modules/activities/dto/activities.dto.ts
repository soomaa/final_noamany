import { IsInt, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ListActivitiesDto extends PaginationDto {}

export class CreateActivityDto {
  @IsInt()
  empId!: number;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateActivityDto {
  @IsOptional()
  @IsInt()
  empId?: number;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

/** Rejection of an activity (legacy suspend=2 with rad_notes reason). */
export class RejectActivityDto {
  @IsOptional()
  @IsString()
  radNotes?: string;
}

/** Attach an already-uploaded gallery image (frontend uploads to /api/uploads/activity first). */
export class AddActivityFileDto {
  @IsString()
  fileName!: string;
}
