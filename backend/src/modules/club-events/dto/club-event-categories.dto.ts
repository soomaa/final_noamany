import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

const KINDS = ['competition','challenge','workshop','bootcamp','seminar','open_day','community','kids_activity','campaign'] as const;

export class ListEventCategoriesDto extends PaginationDto {
  @IsOptional() @IsIn(KINDS) kind?: string;
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() showInApp?: boolean;
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() isActive?: boolean;
}

export class CreateEventCategoryDto {
  @IsString() @MaxLength(150) name_ar!: string;
  @IsOptional() @IsString() @MaxLength(150) name_en?: string;
  @IsIn(KINDS) kind!: string;
  @IsOptional() @IsString() @MaxLength(20) color?: string;
  @IsOptional() @IsString() @MaxLength(50) icon?: string;
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true || value === 1) @IsBoolean() show_in_app?: boolean;
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true || value === 1) @IsBoolean() requires_approval?: boolean;
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true || value === 1) @IsBoolean() is_active?: boolean;
}

export class UpdateEventCategoryDto {
  @IsOptional() @IsString() @MaxLength(150) name_ar?: string;
  @IsOptional() @IsString() @MaxLength(150) name_en?: string;
  @IsOptional() @IsIn(KINDS) kind?: string;
  @IsOptional() @IsString() @MaxLength(20) color?: string;
  @IsOptional() @IsString() @MaxLength(50) icon?: string;
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true || value === 1) @IsBoolean() show_in_app?: boolean;
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true || value === 1) @IsBoolean() requires_approval?: boolean;
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true || value === 1) @IsBoolean() is_active?: boolean;
}
