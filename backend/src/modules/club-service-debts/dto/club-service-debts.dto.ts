import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { ClubReceiptPaymentDto } from '../../club-subscriptions/dto/club-receipts.dto';

export class ListClubServiceDebtsDto extends PaginationDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @Transform(({ value }) => value ? Number(value) : undefined) @IsInt() memberId?: number;
  @IsOptional() @Transform(({ value }) => value && value !== 'all' ? Number(value) : undefined) @IsInt() branchId?: number;
}

export class PayClubServiceDebtDto {
  @Transform(({ value }) => Number(value)) @IsNumber() @Min(0.01) amount!: number;
  @IsOptional() @IsString() paymentMethod?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(8) @ValidateNested({ each: true }) @Type(() => ClubReceiptPaymentDto)
  payments?: ClubReceiptPaymentDto[];
}
