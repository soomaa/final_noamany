import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
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

export class TransferSubscriptionPlanDto {
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  subscriptionId!: number;

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  toSubscriptionTypeId!: number;

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
}

