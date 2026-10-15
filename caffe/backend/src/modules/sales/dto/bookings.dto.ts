import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsEnum,
  Matches,
  Min,
} from 'class-validator';
import { SalesBookingStatus, SalesPaymentMethod } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

export class BookingAvailabilityQueryDto {
  @Type(() => Number) @IsInt() branchId!: number;
  @IsDateString() date!: string;
  @IsString() @Matches(TIME_RE) time!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) totalTables?: number;
}

export class BookingTimeSlotsQueryDto {
  @Type(() => Number) @IsInt() branchId!: number;
  @IsDateString() date!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) totalTables?: number;
}

export class ListBookingsDto extends PaginationDto {
  @IsOptional() @Type(() => Number) @IsInt() branchId?: number;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @IsString() status?: string;
}

export class CreateBookingDto {
  @IsString() customerName!: string;
  @IsString() customerPhone!: string;
  @IsInt() branchId!: number;
  @IsInt() serviceId!: number;
  @IsOptional() @IsInt() salesEmployeeId?: number;
  @IsDateString() bookingDate!: string;
  @IsString() @Matches(TIME_RE) bookingTime!: string;
  @IsOptional() @IsNumber() @Min(0) finalAmount?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) totalTables?: number;
  @IsOptional() @IsString() notes?: string;
}

export class BookingPaymentDto {
  @Type(() => Number) @IsNumber() @Min(0.01) amount!: number;
  @IsEnum(SalesPaymentMethod) method!: SalesPaymentMethod;
  @IsDateString() paymentDate!: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateBookingStatusDto {
  @IsEnum(SalesBookingStatus) status!: SalesBookingStatus;
}
