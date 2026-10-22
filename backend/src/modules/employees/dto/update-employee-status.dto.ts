import { IsIn, IsInt } from 'class-validator';

/** Allowed values for employees.employee_type: active (1) and suspended (2). */
export class UpdateEmployeeStatusDto {
  @IsInt()
  @IsIn([1, 2])
  employee_type!: number;
}
