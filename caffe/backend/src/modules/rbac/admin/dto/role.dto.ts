import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateRoleDto {
  @IsString()
  @MinLength(1, { message: 'اسم الدور مطلوب' })
  nameAr!: string;

  @IsOptional()
  @IsString()
  nameEn?: string;

  @IsOptional()
  @IsString()
  description?: string;

  /** optional explicit key; otherwise generated from nameEn/nameAr. */
  @IsOptional()
  @IsString()
  key?: string;
}

export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  nameAr?: string;

  @IsOptional()
  @IsString()
  nameEn?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class CloneRoleDto {
  @IsString()
  @MinLength(1, { message: 'اسم الدور مطلوب' })
  nameAr!: string;

  @IsOptional()
  @IsString()
  nameEn?: string;

  @IsOptional()
  @IsString()
  key?: string;
}

/** One tri-state change in a matrix save. state 'inherit' => delete the stored row. */
export class MatrixChangeDto {
  @IsString()
  resourceKey!: string;

  @IsString()
  actionKey!: string;

  @IsIn(['inherit', 'allow', 'deny'])
  state!: 'inherit' | 'allow' | 'deny';
}

export class SaveMatrixDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MatrixChangeDto)
  changes!: MatrixChangeDto[];
}

export class AssignRolesDto {
  @IsArray()
  @IsInt({ each: true })
  roleIds!: number[];
}
