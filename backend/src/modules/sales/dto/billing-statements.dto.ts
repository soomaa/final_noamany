import { Type } from "class-transformer";
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  ValidateIf,
  Min,
} from "class-validator";
import { PaginationDto } from "../../../common/dto/pagination.dto";

export class BillingPreviewQueryDto {
  @IsIn(["employee", "partner", "hospitality"]) accountType!: "employee" | "partner" | "hospitality";
  @ValidateIf((o) => o.accountType !== "hospitality") @Type(() => Number) @IsInt() @Min(1) accountId!: number;
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
  @IsIn(["direct_payment", "payroll_deduction", "profit_share_deduction", "partner_account"])
  settlementMethod!:
    "direct_payment" | "payroll_deduction" | "profit_share_deduction" | "partner_account";
  @ValidateIf((o) => o.settlementMethod === "partner_account") @Type(() => Number) @IsInt() @Min(1) partnerId?: number;
  @IsOptional() @IsIn(["cash", "card", "wallet", "transfer"]) paymentMethod?:
    "cash" | "card" | "wallet" | "transfer";
  @IsOptional() @IsString() notes?: string;
}

export class ListBillingStatementsDto extends PaginationDto {
  @IsOptional() @IsIn(["employee", "partner", "hospitality"]) accountType?:
    "employee" | "partner" | "hospitality";
  @IsOptional() @Type(() => Number) @IsInt() accountId?: number;
  @IsOptional()
  @IsIn(["issued", "settled", "cancelled", "all"])
  status?: string;
  @IsOptional() @Type(() => Number) @IsInt() branchId?: number;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
}
