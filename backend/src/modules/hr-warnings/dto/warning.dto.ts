import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

export class WarningAttachmentDto {
  @IsString()
  title!: string;

  @IsString()
  file!: string;
}

export class CreateWarningDto {
  @IsInt()
  empId!: number;

  @IsInt()
  typeId!: number;

  @IsOptional()
  @IsString()
  details?: string;

  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WarningAttachmentDto)
  attachments?: WarningAttachmentDto[];
}

export class UpdateWarningDto extends PartialType(CreateWarningDto) {}

export class SendToEmpDto {
  @IsOptional()
  @IsString()
  hrNotes?: string;
}

export class CreateWarningTemplateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title!: string;

  @IsOptional()
  @IsString()
  details?: string;
}

export class UpdateWarningTemplateDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  details?: string;
}
