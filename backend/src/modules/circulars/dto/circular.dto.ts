import { IsArray, IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ListCircularsDto extends PaginationDto {}

export class CreateCircularDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  date?: string;

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
}
