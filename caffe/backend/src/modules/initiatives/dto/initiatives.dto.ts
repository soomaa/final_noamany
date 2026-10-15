import { IsInt, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ListInitiativesDto extends PaginationDto {}

export class CreateInitiativeDto {
  @IsInt()
  empId!: number;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsInt()
  forMonth?: number;

  @IsOptional()
  @IsInt()
  forYear?: number;
}

export class UpdateInitiativeDto {
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
  @IsInt()
  forMonth?: number;

  @IsOptional()
  @IsInt()
  forYear?: number;
}

/**
 * Reject an initiative: legacy sets suspend=2 and stores the rejection
 * reason in rad_notes (radd = ردّ / response).
 */
export class RejectInitiativeDto {
  @IsOptional()
  @IsString()
  radNotes?: string;
}
