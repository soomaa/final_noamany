import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import {
  CLUB_PAYMENT_METHODS,
  ClubPaymentMethodValue,
  ClubReceiptPaymentDto,
} from './club-receipts.dto';

export class UpsertPrivatePackageDto {
  @IsIn(['subscription', 'sessions'])
  kind!: 'subscription' | 'sessions';

  @IsString()
  @MaxLength(150)
  name!: string;

  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  price!: number;

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(3650)
  durationDays!: number;

  @IsOptional()
  @Transform(({ value }) => (value == null || value === '' ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  sessionsCount?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @Transform(({ value }) => Array.isArray(value) ? value.map(Number) : value)
  @IsInt({ each: true })
  @Min(1, { each: true })
  branchIds!: number[];
}

export class CreatePrivateEnrollmentDto {
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  memberId!: number;

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  packageId!: number;

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  trainerId!: number;

  @IsOptional()
  @Transform(({ value }) => (value == null || value === '' ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  branchId?: number;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  registrationDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  discountType?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  discountValue = 0;

  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  paidAmount!: number;

  @IsOptional()
  @IsIn(['male', 'female'])
  gender?: 'male' | 'female';

  @IsOptional()
  @IsIn(CLUB_PAYMENT_METHODS)
  paymentMethod?: ClubPaymentMethodValue;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => ClubReceiptPaymentDto)
  payments?: ClubReceiptPaymentDto[];
}

export class ListPrivateEnrollmentsDto extends PaginationDto {
  @IsOptional()
  @Transform(({ value }) => (value == null || value === '' ? undefined : Number(value)))
  @IsInt()
  branchId?: number;

  @IsOptional()
  @Transform(({ value }) => (value == null || value === '' ? undefined : Number(value)))
  @IsInt()
  trainerId?: number;

  @IsOptional()
  @IsIn(['active', 'expired', 'upcoming', 'frozen', 'all'])
  status?: string;
}
