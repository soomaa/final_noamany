import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  CLUB_PAYMENT_METHODS,
  ClubPaymentMethodValue,
  ClubReceiptPaymentDto,
} from './club-receipts.dto';

export const TRANSFER_START_FROM = ['original', 'today'] as const;
export type TransferStartFrom = (typeof TRANSFER_START_FROM)[number];

export class TransferSubscriptionPlanDto {
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  subscriptionId!: number;

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  toSubscriptionTypeId!: number;

  /** Explicit entitlement, independent of the carried credit. Omitted for legacy credit-only conversions. */
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  targetSessionsCount?: number;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  preservePeriod?: boolean;

  @IsString()
  toStartDate!: string;

  @IsOptional()
  @IsString()
  transferDate?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  additionalPaidAmount?: number;

  @IsOptional()
  @IsIn(CLUB_PAYMENT_METHODS)
  paymentMethod?: ClubPaymentMethodValue;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => ClubReceiptPaymentDto)
  payments?: ClubReceiptPaymentDto[];

  @IsOptional()
  @IsIn(CLUB_PAYMENT_METHODS)
  refundPaymentMethod?: ClubPaymentMethodValue;

  /** Time → time plans: `original` (default) keeps the original start; `today` starts now. */
  @IsOptional()
  @IsIn(TRANSFER_START_FROM)
  startFrom?: TransferStartFrom;

  /** Optional discount on the new plan; it can only reduce the difference due, never create a refund. */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === 1)
  @IsBoolean()
  discountEnabled?: boolean;

  @IsOptional()
  @Transform(({ value }) => (value != null && value !== '' ? Number(value) : null))
  @IsInt()
  @Min(1)
  discountCodeId?: number | null;

  @IsOptional()
  @Transform(({ value }) => (value != null && value !== '' ? Number(value) : undefined))
  @IsNumber()
  @Min(0)
  discountValue?: number;
}
