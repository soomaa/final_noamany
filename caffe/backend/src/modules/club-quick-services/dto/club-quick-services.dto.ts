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
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import {
  CLUB_PAYMENT_METHODS,
  ClubPaymentMethodValue,
  ClubReceiptPaymentDto,
} from '../../club-subscriptions/dto/club-receipts.dto';

export class ListClubQuickServicesDto extends PaginationDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean()
  activeOnly?: boolean;

  @IsOptional()
  @Transform(({ value }) => (value != null && value !== '' ? Number(value) : undefined))
  @IsInt()
  branchId?: number;
}

export class UpsertClubQuickServiceDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0.01)
  price!: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Transform(({ value }) => (value != null && value !== '' ? Number(value) : null))
  @IsInt()
  branchId?: number | null;

  @IsOptional()
  @Transform(({ value }) => (value != null ? Number(value) : 0))
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class SellClubQuickServiceDto {
  @Transform(({ value }) => Number(value))
  @IsInt()
  serviceId!: number;

  @IsOptional()
  @Transform(({ value }) => (value != null && value !== '' ? Number(value) : undefined))
  @IsInt()
  memberId?: number;

  /** Required for walk-in when memberId is omitted. */
  @IsOptional()
  @IsString()
  memberName?: string;

  @IsOptional()
  @Transform(({ value }) => (value != null && value !== '' ? Number(value) : undefined))
  @IsInt()
  branchId?: number;

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
  @IsString()
  notes?: string;
}
