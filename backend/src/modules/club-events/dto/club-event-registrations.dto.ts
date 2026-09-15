import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ListEventRegistrationsDto extends PaginationDto {
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() eventId?: number;
  @IsOptional() @IsIn(['pending_payment','confirmed','waitlisted','cancelled','refunded']) status?: string;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() memberId?: number;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() branchId?: number;
}

export class CreateRegistrationDto {
  @Transform(({ value }) => Number(value)) @IsInt() event_id!: number;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() session_id?: number;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() tier_id?: number;
  @IsIn(['member','guest','lead']) registrant_type!: string;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() member_id?: number;
  @IsOptional() @IsString() @MaxLength(200) guest_name?: string;
  @IsOptional() @IsString() @MaxLength(20) guest_phone?: string;
  @IsOptional() @IsString() @MaxLength(150) guest_email?: string;
  @Transform(({ value }) => Number(value)) @IsInt() branch_id!: number;
  @IsOptional() @IsString() @MaxLength(10) participant_dob?: string;
  @IsOptional() @IsString() @MaxLength(200) guardian_name?: string;
  @IsOptional() @IsString() @MaxLength(20) guardian_phone?: string;
  @IsOptional() @IsString() @MaxLength(50) guardian_relation?: string;
  @IsOptional() @IsString() @MaxLength(20) emergency_phone?: string;
  @IsOptional() @IsString() @MaxLength(20) channel?: string;
  @IsOptional() @IsString() notes?: string;
}

export class PayRegistrationDto {
  @IsString() @MaxLength(30) payment_number!: string;
  @Transform(({ value }) => Number(value)) @IsInt() @Min(1) amount!: number;
  @IsOptional() @IsString() payment_method?: string;
  @IsString() @MaxLength(10) payment_date!: string;
  @IsOptional() @IsString() @MaxLength(64) idempotency_key?: string;
  @IsOptional() @IsString() description?: string;
}

export class CancelRegistrationDto {
  @IsOptional() @IsString() @MaxLength(255) cancel_reason?: string;
}
