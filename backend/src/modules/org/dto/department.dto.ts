import { IsInt, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateDepartmentDto {
  @IsString()
  @MinLength(1, { message: 'اسم الإدارة/القسم مطلوب' })
  title!: string;

  @IsOptional()
  @IsInt()
  parentId?: number;

  @IsOptional()
  @IsInt()
  code?: number;

  @IsOptional()
  @IsInt()
  order?: number;

  @IsOptional()
  @IsInt()
  fromCode?: number;

  @IsOptional()
  @IsInt()
  toCode?: number;
}

export class UpdateDepartmentDto extends CreateDepartmentDto {}
