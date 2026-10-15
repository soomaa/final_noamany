import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

/**
 * System-user lifecycle DTOs — faithful to legacy User.php (add/edit/del/status).
 * level: 1 => مدير على النظام, 2 => موظف على النظام, 3 => مدير فرع.
 * Distinct from the existing users module's CreateUserDto (which derives
 * name/branch/emp_code from a selected employee); this admin CRUD takes the
 * fields directly so the manage screen can edit any system user.
 */
export class CreateSystemUserDto {
  @IsString()
  @MinLength(3)
  username!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  @MinLength(5)
  password!: string;

  @Transform(({ value }) => (value == null || value === '' ? value : parseInt(value, 10)))
  @IsInt()
  @IsIn([1, 2, 3])
  level!: number;

  @IsOptional()
  @Transform(({ value }) => (value == null || value === '' ? undefined : parseInt(value, 10)))
  @IsInt()
  branchId?: number;

  @IsOptional()
  @Transform(({ value }) => (value == null || value === '' ? undefined : parseInt(value, 10)))
  @IsInt()
  empCode?: number;
}

export class UpdateSystemUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @Transform(({ value }) => (value == null || value === '' ? undefined : parseInt(value, 10)))
  @IsInt()
  @IsIn([1, 2, 3])
  level?: number;

  @IsOptional()
  @Transform(({ value }) => (value == null || value === '' ? undefined : parseInt(value, 10)))
  @IsInt()
  branchId?: number;

  // Only rehashed when a non-empty value is supplied (legacy: `if (!empty($password))`).
  @IsOptional()
  @IsString()
  @MinLength(5)
  password?: string;
}

/** PATCH /:id/status — faithful to User::status_user_type (approved 0|1). */
export class UpdateUserStatusDto {
  @Transform(({ value }) => (value == null || value === '' ? value : parseInt(value, 10)))
  @IsInt()
  @IsIn([0, 1])
  approved!: number;
}
