import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ListQuickPurchaseOrdersDto extends PaginationDto {
  @IsOptional() @IsString() supplierId?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
}

export class QuickPurchaseOrderStatisticsDto {
  @IsOptional() @IsString() supplierId?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsString() branchId?: string;
}

export class UpsertQuickPurchaseOrderDto {
  @IsOptional() @IsString() orderNumber?: string;
  @IsInt() supplierId!: number;
  @IsInt() productId!: number;
  @IsString() productName!: string;
  @IsNumber() @Min(0.001) quantity!: number;
  @IsNumber() @Min(0) unitPrice!: number;
  @IsInt() warehouseId!: number;
  @IsInt() branchId!: number;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsIn(['مسودة', 'مؤكد', 'ملغي']) status?: string;
}

export class ChangeQuickPurchaseOrderStatusDto {
  @IsIn(['مسودة', 'مؤكد', 'ملغي'])
  status!: string;
}

export class ListPurchaseReturnsDto extends PaginationDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() supplierId?: string;
}

export class PurchaseReturnItemDto {
  @IsInt() productId!: number;
  @IsString() productName!: string;
  @IsNumber() @Min(0.001) quantity!: number;
  @IsOptional() @IsNumber() @Min(0) unitPrice?: number;
  @IsOptional() @IsNumber() @Min(0) total?: number;
}

export class UpsertPurchaseReturnDto {
  @IsOptional() @IsString() returnNumber?: string;
  @IsInt() supplierId!: number;
  @IsInt() warehouseId!: number;
  @IsInt() branchId!: number;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsIn(['مسودة', 'معتمد', 'مكتمل', 'ملغي']) status?: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseReturnItemDto)
  items!: PurchaseReturnItemDto[];
}

export class ChangePurchaseReturnStatusDto {
  @IsIn(['مسودة', 'معتمد', 'مكتمل', 'ملغي'])
  status!: string;
}
