import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ListEventSessionsDto extends PaginationDto {
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() eventId?: number;
  @IsOptional() @IsString() dateFrom?: string;
  @IsOptional() @IsString() dateTo?: string;
}

export class CreateEventSessionDto {
  @Transform(({ value }) => Number(value)) @IsInt() event_id!: number;
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsString() @MaxLength(10) session_date!: string;
  @IsString() @MaxLength(8) start_time!: string;
  @IsString() @MaxLength(8) end_time!: string;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() hall_id?: number;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() trainer_id?: number;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(0) max_capacity?: number;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(0) order_index?: number;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateEventSessionDto {
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(10) session_date?: string;
  @IsOptional() @IsString() @MaxLength(8) start_time?: string;
  @IsOptional() @IsString() @MaxLength(8) end_time?: string;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() hall_id?: number;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() trainer_id?: number;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(0) max_capacity?: number;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(0) order_index?: number;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() notes?: string;
}
