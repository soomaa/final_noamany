import { Type } from "class-transformer";
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
} from "class-validator";
import { PaginationDto } from "../../../common/dto/pagination.dto";

export class BillingPreviewQueryDto {
  @IsIn(["employee", "partner"]) accountType!: "employee" | "partner";
  @Type(() => Number) @IsInt() accountId!: number;
  @IsDateString() periodStart!: string;
  @IsDateString() periodEnd!: string;
  @IsOptional() @Type(() => Number) @IsInt() branchId?: number;
  @IsOptional() @IsIn(["daily", "monthly"]) billingCycle?: "daily" | "monthly";
}

export class CreateBillingStatementDto extends BillingPreviewQueryDto {
  @IsIn(["daily", "monthly"]) declare billingCycle: "daily" | "monthly";
  @IsOptional() @IsArray() @IsInt({ each: true }) saleIds?: number[];
  @IsOptional() @IsString() notes?: string;
}

export class SettleBillingStatementDto {
  @IsIn(["direct_payment", "payroll_deduction", "profit_share_deduction"])
  settlementMethod!:
    "direct_payment" | "payroll_deduction" | "profit_share_deduction";
  @IsOptional() @IsIn(["cash", "card", "wallet", "transfer"]) paymentMethod?:
    "cash" | "card" | "wallet" | "transfer";
  @IsOptional() @IsString() notes?: string;
}

export class ListBillingStatementsDto extends PaginationDto {
  @IsOptional() @IsIn(["employee", "partner"]) accountType?:
    "employee" | "partner";
  @IsOptional() @Type(() => Number) @IsInt() accountId?: number;
  @IsOptional()
  @IsIn(["issued", "settled", "cancelled", "all"])
  status?: string;
  @IsOptional() @Type(() => Number) @IsInt() branchId?: number;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
}
