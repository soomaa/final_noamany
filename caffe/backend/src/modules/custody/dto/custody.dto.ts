import { IsInt, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ListCustodyDto extends PaginationDto {}

export class CreateCustodyDto {
  @IsInt()
  empId!: number;

  @IsOptional()
  @IsInt()
  custodyId?: number;

  @IsString()
  custodyTitle!: string;

  @IsOptional()
  @IsInt()
  num?: number;

  @IsOptional()
  @IsInt()
  status?: number;

  @IsOptional()
  @IsString()
  dateReceived?: string;
}

export class UpdateCustodyDto {
  @IsOptional()
  @IsInt()
  empId?: number;

  @IsOptional()
  @IsInt()
  custodyId?: number;

  @IsOptional()
  @IsString()
  custodyTitle?: string;

  @IsOptional()
  @IsInt()
  num?: number;

  @IsOptional()
  @IsInt()
  status?: number;

  @IsOptional()
  @IsString()
  dateReceived?: string;
}

/**
 * Transfer a single custody item from one employee to another.
 * Mirrors legacy Custody_employee_model::transfer_operation /
 * transfer_operation_new: writes an emp_custody_transfer_operations
 * history row and flips ownership on the emp_custody row.
 */
export class TransferCustodyDto {
  /** emp_custody.id (the custody item being transferred) */
  @IsInt()
  custodyId!: number;

  /** current owner employees.id */
  @IsInt()
  fromEmpCode!: number;

  /** new owner employees.id */
  @IsInt()
  toEmpCode!: number;
}
