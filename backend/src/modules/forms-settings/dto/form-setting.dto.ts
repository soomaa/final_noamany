import { IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

export class CreateFormSettingDto {
  @IsString() @IsNotEmpty() @MaxLength(255) title!: string;
  @IsInt() @Min(1) type!: number;
  @IsOptional() @IsString() @MaxLength(255) typeName?: string;
  @IsOptional() @Matches(/^\d+(?:\.\d+)?$/) maxDegree?: string;
  @IsOptional() @IsInt() @Min(0) inOrder?: number;
}

export class UpdateFormSettingDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(255) title?: string;
  @IsOptional() @Matches(/^\d+(?:\.\d+)?$/) maxDegree?: string;
  @IsOptional() @IsInt() @Min(0) inOrder?: number;
}
