import { Transform } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

/** Keep query filters as strings — enableImplicitConversion would turn "1" into a number and fail @IsString. */
function toOptionalString({ value }: { value: unknown }): string | undefined {
  if (value == null || value === '') return undefined;
  return String(value);
}

export class ListEmployeesDto extends PaginationDto {
  @IsOptional() @Transform(toOptionalString) @IsString() branch?: string;
  @IsOptional() @Transform(toOptionalString) @IsString() edara?: string;
  @IsOptional() @Transform(toOptionalString) @IsString() gender?: string;
  @IsOptional() @Transform(toOptionalString) @IsString() emp_type?: string;
  /** Active/suspended codes ("0"|"1"|"2") or "resigned" / "left" for leavers. */
  @IsOptional() @Transform(toOptionalString) @IsString() status?: string;
}
