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
 * Faithful to legacy User::edit / User_m::edit.
 * - username: required, min 5 (legacy callback_username_check excludes self).
 * - password: optional; only updated when provided (min 5).
 * - level: required. 1 => free-text name. 2/3 => derive from selected employee.
 */
export class UpdateUserDto {
  @IsString()
  @MinLength(5)
  username!: string;

  @IsOptional()
  @ValidateIf((o) => o.password != null && o.password !== '')
  @IsString()
  @MinLength(5)
  password?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @Transform(({ value }) => (value == null || value === '' ? value : parseInt(value, 10)))
  @IsInt()
  @IsIn([1, 2, 3])
  level!: number;

  @ValidateIf((o) => Number(o.level) === 1)
  @IsString()
  fullname?: string;

  @ValidateIf((o) => Number(o.level) !== 1)
  @Transform(({ value }) => (value == null || value === '' ? value : parseInt(value, 10)))
  @IsInt()
  empCode?: number;

  @IsOptional()
  @IsString()
  image?: string;
}
