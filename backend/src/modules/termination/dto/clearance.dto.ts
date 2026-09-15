import { IsArray, IsInt, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ListClearanceDto extends PaginationDto {}

export class ClearanceLineDto {
  @IsString()
  adminstrationId!: string;

  @IsOptional()
  @IsString()
  responsibleEmpId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateClearanceDto {
  @IsInt()
  empId!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClearanceLineDto)
  lines!: ClearanceLineDto[];
}

export class UpdateClearanceDto extends CreateClearanceDto {}
