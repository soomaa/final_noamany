import { IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ListEmployeesDto extends PaginationDto {
  @IsOptional() @IsString() branch?: string;
  @IsOptional() @IsString() edara?: string;
  @IsOptional() @IsString() gender?: string;
  @IsOptional() @IsString() emp_type?: string;
  @IsOptional() @IsString() status?: string;
}
