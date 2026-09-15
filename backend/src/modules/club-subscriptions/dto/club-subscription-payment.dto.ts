import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
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

/** Server-owned inputs for a current-price renewal quote. Package and dates are never client inputs. */
export class QuoteClubSubscriptionRenewalDto {
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
}

/** Quote acceptance for `PATCH /club-subscriptions/:id/renew`. */
export class RenewClubSubscriptionDto extends QuoteClubSubscriptionRenewalDto {
  @IsString()
  @IsNotEmpty()
  quoteVersion!: string;
}
