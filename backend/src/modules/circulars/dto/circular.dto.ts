import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';
import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, ValidateNested } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ListCircularsDto extends PaginationDto {}

export class CircularAttachmentDto {
  @IsString()
  title!: string;

  @IsString()
  file!: string;
}

export class CreateCircularDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  date?: string;

  /** Main circular image/file used by the legacy mobile API (`ta3mem_img`). */
  @IsOptional()
  @IsString()
  image?: string;

  /** Explicit all-employees routing; avoids silently saving a circular with no recipients. */
  @IsOptional()
  @IsBoolean()
  sendToAll?: boolean;

  /**
   * Recipient routing mode (legacy load_tahwel `type`):
   *  1 = target whole departments/edarat (expand to their employees)
   *  2 = target individual employees (default)
   */
  @IsOptional()
  @IsInt()
  @IsIn([1, 2])
  recipientType?: number;

  /** type=2: explicit employee ids (employees.id) */
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  empIds?: number[];

  /** type=1: targeted edara ids (hr_edarat_aqsam.id) — expanded to their employees */
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  edaraIds?: number[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CircularAttachmentDto)
  attachments?: CircularAttachmentDto[];
}

export class UpdateCircularDto extends PartialType(CreateCircularDto) {}
