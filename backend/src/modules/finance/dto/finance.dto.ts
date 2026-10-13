import { Type } from 'class-transformer';
import {
  IsBoolean,
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
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() approvalStatus?: string;
  @IsOptional() @IsString() paymentStatus?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @IsIn(['male', 'female', 'all']) genderScope?: string;
}

export class UpsertExpenseDto {
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
  /** نطاق الجنس: تحديد ما إذا كان المصروف خاصاً بقسم الرجال أو الحريم */
  @IsOptional() @IsIn(['male', 'female']) genderScope?: 'male' | 'female';
  /** تفعيل التوزيع بالنسب بين الرجال والحريم */
  @IsOptional() @IsBoolean() hasPercentage?: boolean;
  /** نسبة الرجال (0-100) — مطلوبة عند hasPercentage=true */
  @IsOptional() @IsNumber() @Min(0) malePercentage?: number;
  /** نسبة الحريم (0-100) — مطلوبة عند hasPercentage=true */
  @IsOptional() @IsNumber() @Min(0) femalePercentage?: number;
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
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
}

export class ListRevenuesDto extends PaginationDto {
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() source?: string;
  @IsOptional() @IsString() paymentStatus?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
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
}

export class TopCustomersQueryDto extends PaginationDto {
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
}

export class FinanceDashboardQueryDto {
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  /** Alias accepted from older frontend query params. */
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
}

export class ExpenseReportsQueryDto {
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
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
}

export class FinanceAnalysisQueryDto {
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) cafeCategoryId?: number;
  @IsOptional() @IsIn(['male', 'female']) gender?: 'male' | 'female';
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
}

export class DailyClosingQueryDto {
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsDateString() fromDate?: string;
  @IsOptional() @IsDateString() toDate?: string;
  @IsOptional() @IsIn(['male', 'female']) gender?: 'male' | 'female';
}

export class TargetReportQueryDto {
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) employeeId?: number;
  /** Compatibility alias for clients that name the selected salesperson explicitly. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) targetEmployeeId?: number;
  @IsOptional() @IsIn(['subscriptions', 'sales', 'all'])
  operationType?: 'subscriptions' | 'sales' | 'all';
  @IsOptional() @IsIn(['subscriptions', 'sales', 'all'])
  operation?: 'subscriptions' | 'sales' | 'all';
  @IsOptional() @IsDateString() fromDate?: string;
  @IsOptional() @IsDateString() toDate?: string;
}

export class ProfitLossQueryDto {
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
}
