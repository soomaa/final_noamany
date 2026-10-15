import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsArray,
  ValidateNested,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ListExpensesDto extends PaginationDto {
  @IsOptional() @IsIn(['gym', 'cafe']) businessUnit?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() approvalStatus?: string;
  @IsOptional() @IsString() paymentStatus?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  /** Only global/branch finance scopes may select another creator. */
  @IsOptional() @IsString() userId?: string;
}

export class ExpenseUserOptionsQueryDto {
  @IsOptional() @IsIn(['gym', 'cafe']) businessUnit?: string;
  @IsOptional() @IsString() branchId?: string;
}

export class ExpensePaymentDto {
  @IsIn(['cash', 'card', 'visa', 'transfer', 'bank', 'wallet', 'instapay', 'online']) method!: string;
  @IsNumber() @Min(0) amount!: number;
}

export class UpsertExpenseDto {
  @IsOptional() @IsIn(['gym', 'cafe']) businessUnit?: string;
  @IsOptional() @IsNumber() @Min(0) paidAmount?: number;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ExpensePaymentDto) payments?: ExpensePaymentDto[];
  @IsOptional() @IsString() expenseDate?: string;
  @IsString() category!: string;
  @IsOptional() @IsString() subCategory?: string;
  @IsNumber() @Min(0) amount!: number;
  @IsOptional() @IsNumber() @Min(0) taxAmount?: number;
  @IsOptional() @IsString() paymentMethod?: string;
  @IsOptional() @IsString() paymentStatus?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() vendor?: string;
  @IsOptional() @IsString() invoiceNumber?: string;
  @IsOptional() @IsInt() branchId?: number;
  @IsOptional() @IsInt() departmentId?: number;
  @IsOptional() notes?: string;
  @IsOptional() @IsBoolean() isRecurring?: boolean;
  @IsOptional() @IsString() recurringFrequency?: string;
  @IsOptional() @IsString() nextRecurringDate?: string;
  @IsOptional() @IsBoolean() deductFromDrawer?: boolean;
}

export class UpsertExpenseCategoryDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() sortOrder?: number;
}

export class RejectExpenseDto {
  @IsString() notes!: string;
}

export class ExpenseStatisticsQueryDto {
  @IsOptional() @IsIn(['gym', 'cafe']) businessUnit?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @IsString() userId?: string;
}

export class ListRevenuesDto extends PaginationDto {
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() source?: string;
  @IsOptional() @IsString() paymentStatus?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  /** Admin-only filter; non-admins are always locked to themselves server-side. */
  @IsOptional() @IsString() userId?: string;
}

export class UpsertRevenueDto {
  @IsOptional() @IsString() revenueDate?: string;
  @IsString() source!: string;
  @IsOptional() @IsString() subSource?: string;
  @IsNumber() @Min(0) amount!: number;
  @IsOptional() @IsNumber() @Min(0) taxAmount?: number;
  @IsOptional() @IsNumber() @Min(0) discountAmount?: number;
  @IsOptional() @IsString() paymentMethod?: string;
  @IsOptional() @IsString() paymentStatus?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() customerName?: string;
  @IsOptional() @IsString() invoiceNumber?: string;
  @IsOptional() @IsString() receiptNumber?: string;
  @IsOptional() @IsInt() branchId?: number;
  @IsOptional() notes?: string;
  @IsOptional() @IsBoolean() isRecurring?: boolean;
  @IsOptional() @IsString() recurringFrequency?: string;
  @IsOptional() @IsString() nextRecurringDate?: string;
  @IsOptional() @IsBoolean() deductFromDrawer?: boolean;
}

export class SyncRevenuesDto {
  @IsDateString() startDate!: string;
  @IsDateString() endDate!: string;
  @IsOptional() @IsInt() branchId?: number;
}

export class RevenueStatisticsQueryDto {
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @IsString() userId?: string;
}

export class TopCustomersQueryDto extends PaginationDto {
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
  @IsOptional() @IsString() userId?: string;
}

export class FinanceDashboardQueryDto {
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  /** Alias accepted from older frontend query params. */
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsString() userId?: string;
}

export class ExpenseReportsQueryDto {
  @IsOptional() @IsIn(['gym', 'cafe']) businessUnit?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsString() userId?: string;
}

export class RevenueReportsQueryDto {
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  /** Filter fin_revenues rows by source label (e.g. 'اشتراكات النادي'); 'all' = no filter. */
  @IsOptional() @IsString() source?: string;
  /** Scope the subscriptions breakdown (receipts + refunds) to one club_subscription_types id. */
  @IsOptional() @IsString() subscriptionTypeId?: string;
  @IsOptional() @IsString() userId?: string;
}

export class FinanceAnalysisQueryDto {
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsString() userId?: string;
}

export class ProfitLossQueryDto {
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsString() userId?: string;
}
