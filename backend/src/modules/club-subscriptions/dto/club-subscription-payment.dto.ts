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

export const RENEWAL_START_MODES = ['extend', 'today'] as const;
export type RenewalStartMode = (typeof RENEWAL_START_MODES)[number];

/** Body of `PATCH /club-subscriptions/:id/payment` — collect part or all of the balance (تحصيل). */
export class ProcessClubPaymentDto {
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0.01)
  paymentAmount!: number;

  @IsOptional()
  @IsIn(CLUB_PAYMENT_METHODS)
  paymentMethod?: ClubPaymentMethodValue;

  /** Split `paymentAmount` across methods. Must add up to `paymentAmount`. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => ClubReceiptPaymentDto)
  payments?: ClubReceiptPaymentDto[];
}

/** Editable financial inputs for a server-authoritative renewal quote. */
export class QuoteClubSubscriptionRenewalDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  privateTrainerId?: number;

  /** Optional live promotion for a compatible package available at the source branch. */
  @IsOptional()
  @Transform(({ value }) => (value != null ? Number(value) : undefined))
  @IsInt()
  @Min(1)
  promotionTypeId?: number;

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
  @Transform(({ value }) => (value != null ? Number(value) : undefined))
  @IsNumber()
  @Min(0)
  discountValue?: number;

  @IsOptional()
  @Transform(({ value }) => (value != null ? Number(value) : undefined))
  @IsNumber()
  @Min(0)
  paidAmount?: number;

  @IsOptional()
  @IsIn(CLUB_PAYMENT_METHODS)
  paymentMethod?: ClubPaymentMethodValue;

  /** Split the up-front renewal payment across methods. Must add up to `paidAmount`. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => ClubReceiptPaymentDto)
  payments?: ClubReceiptPaymentDto[];

  /**
   * `extend` (default) queues the renewal after the current period so remaining days are kept (مد اشتراك).
   * `today` starts the renewal today and closes the still-running current period.
   */
  @IsOptional()
  @IsIn(RENEWAL_START_MODES)
  startMode?: RenewalStartMode;
}

/** Body of `PATCH /club-subscriptions/:id/renew`. Dates and target package are server-owned. */
export class RenewClubSubscriptionDto extends QuoteClubSubscriptionRenewalDto {
  @IsOptional()
  @IsString()
  quoteVersion?: string;
}
