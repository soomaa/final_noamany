import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export const CLUB_PAYMENT_METHODS = [
  'cash',
  'card',
  'bank',
  'online',
  'visa',
  'transfer',
  'wallet',
  'instapay',
] as const;

export type ClubPaymentMethodValue = (typeof CLUB_PAYMENT_METHODS)[number];

/** One tender line of a split collection — `payments` on any club money-in endpoint. */
export class ClubReceiptPaymentDto {
  @IsIn(CLUB_PAYMENT_METHODS)
  method!: ClubPaymentMethodValue;

  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0.01)
  amount!: number;
}

export class ListClubReceiptsDto extends PaginationDto {
  // Receipts default to 50/page (overrides PaginationDto's 20).
  @IsOptional()
  @Transform(({ value }) => (value != null ? parseInt(value, 10) : 50))
  @IsInt()
  @Min(1)
  @Max(200)
  override pageSize: number = 50;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @Transform(({ value }) => (value != null ? Number(value) : undefined))
  @IsInt()
  subscriptionId?: number;

  @IsOptional()
  @Transform(({ value }) => (value != null ? Number(value) : undefined))
  @IsInt()
  memberId?: number;

  @IsOptional()
  @Transform(({ value }) => (value != null ? Number(value) : undefined))
  @IsInt()
  branchId?: number;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}

export class CreateClubReceiptDto {
  @IsString()
  memberName!: string;

  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsString()
  receiptDate?: string;

  @IsOptional()
  @Transform(({ value }) => (value != null ? Number(value) : undefined))
  @IsInt()
  memberId?: number;

  @IsOptional()
  @Transform(({ value }) => (value != null ? Number(value) : undefined))
  @IsInt()
  subscriptionId?: number;

  /** Collection branch. Only needed when neither a subscription nor a member implies one. */
  @IsOptional()
  @Transform(({ value }) => (value != null && value !== '' ? Number(value) : undefined))
  @IsInt()
  branchId?: number;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsIn(CLUB_PAYMENT_METHODS)
  paymentMethod?: ClubPaymentMethodValue;

  /** Split the amount across methods. Must add up to `amount`; omit for a single method. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => ClubReceiptPaymentDto)
  payments?: ClubReceiptPaymentDto[];

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateClubReceiptDto {
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsIn(CLUB_PAYMENT_METHODS)
  paymentMethod?: ClubPaymentMethodValue;
}
