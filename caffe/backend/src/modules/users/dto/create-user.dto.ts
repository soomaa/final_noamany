import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';

/**
 * Faithful to legacy User::adduser / User_m::add.
 * - username: required, min 5 (legacy is_unique[users.username]).
 * - password: required, min 5.
 * - level: required. 1 => free-text name (fullname). 2/3 => derive name/branch/emp_code
 *   from the selected employee (legacy looks up employees by emp_code).
 */
export class CreateUserDto {
  @IsString()
  @MinLength(5)
  username!: string;

  @IsString()
  @MinLength(5)
  password!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @Transform(({ value }) => (value == null || value === '' ? value : parseInt(value, 10)))
  @IsInt()
  @IsIn([1, 2, 3])
  level!: number;

  // Required only when level === 1 (admin / free name).
  @ValidateIf((o) => Number(o.level) === 1)
  @IsString()
  fullname?: string;

  // Required only when level !== 1 — the selected employee's emp_code (business key).
  @ValidateIf((o) => Number(o.level) !== 1)
  @Transform(({ value }) => (value == null || value === '' ? value : parseInt(value, 10)))
  @IsInt()
  empCode?: number;

  @IsOptional()
  @IsString()
  image?: string;
}
