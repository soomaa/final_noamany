import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ListMessagesDto extends PaginationDto {}

export class CreateMessageDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsString()
  body!: string;

  /**
   * employees.id of each recipient. Required unless sendAll is true
   * (legacy "إرسال للجميع" broadcasts to every active employee).
   */
  @ValidateIf((o: CreateMessageDto) => !o.sendAll)
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  @Type(() => Number)
  recipientEmpIds?: number[];

  @IsOptional()
  @IsBoolean()
  sendAll?: boolean;

  /** Stored upload path returned by POST /api/uploads/message. */
  @IsOptional()
  @IsString()
  file?: string;
}

export class ReplyMessageDto {
  @IsString()
  body!: string;
}

/**
 * Broadcast memo (hr_ta3mem_msg) — admin-only internal memo to many employees.
 * Minimal create, mirrors the personal-message compose shape.
 */
export class CreateMemoDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @ValidateIf((o: CreateMemoDto) => !o.sendAll)
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  @Type(() => Number)
  recipientEmpIds?: number[];

  @IsOptional()
  @IsBoolean()
  sendAll?: boolean;
}
