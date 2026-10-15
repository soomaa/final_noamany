import { Transform, Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
  MaxLength,
  Max,
  Matches,
  Min,
  ValidateNested,
} from "class-validator";
import { PaginationDto } from "../../../common/dto/pagination.dto";
import { CafeInvoiceClassificationDto } from '../../cafe/dto/cafe-invoice-classification.dto';

export class ListQuickSalesDto extends PaginationDto {
  @IsOptional() @IsString() branchId?: string;
  @IsOptional()
  @IsIn(["draft", "completed", "refunded", "cancelled", "all"])
  status?: string;
  @IsOptional()
  @IsIn(["cash", "card", "wallet", "transfer", "mixed", "all"])
  paymentMethod?: string;
  @IsOptional() @IsIn(["customer", "employee", "partner", "hospitality"]) saleType?:
    "customer" | "employee" | "partner" | "hospitality";
  @IsOptional() @Type(() => Number) @IsInt() employeeId?: number;
  @IsOptional() @Type(() => Number) @IsInt() partnerId?: number;
  @IsOptional() @IsIn(["immediate", "daily", "monthly"]) billingCycle?:
    "immediate" | "daily" | "monthly";
  @IsOptional()
  @IsIn(["not_applicable", "unbilled", "in_statement", "settled"])
  billingStatus?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @Type(() => Number) @IsInt() shiftSessionId?: number;
  /** Comma-separated shift session ids, e.g. "12,11" */
  @IsOptional() @IsString() shiftSessionIds?: string;
}

export class ListCafeCustomersDto extends PaginationDto {
  @IsInt() @Type(() => Number) branchId!: number;
  @IsOptional() @IsIn(["customer", "employee"]) kind?:
    | "customer"
    | "employee";
  @IsOptional() @IsIn(["spend", "orders"]) sortBy?: "spend" | "orders";
}

export class BundleSelectionItemDto {
  @IsInt() groupId!: number;
  @IsInt() cafeProductId!: number;
  @IsOptional() @IsInt() cafeVariantId?: number;
}

export class CreateQuickSaleItemDto {
  @IsOptional() @IsInt() productId?: number;
  @IsOptional() @IsInt() cafeProductId?: number;
  @IsOptional() @IsInt() cafeVariantId?: number;
  @IsOptional() @IsInt() bundleId?: number;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BundleSelectionItemDto)
  bundleSelections?: BundleSelectionItemDto[];
  @IsString() name!: string;
  @IsOptional() @IsString() productCode?: string;
  @IsOptional() @IsString() @MaxLength(300) itemNote?: string;
  // Kept optional for backwards compatibility. POS prices are always resolved
  // from the server-side product/variant price list and never trusted from clients.
  @IsOptional() @IsNumber() @Min(0) unitPrice?: number;
  @IsNumber() @Min(0.01) quantity!: number;
}

export class PosPaymentDto {
  @IsIn(["cash", "card", "wallet", "transfer"]) method!: string;
  @IsNumber() @Min(0) amount!: number;
  @IsOptional() @IsInt() @Min(1) catalogPaymentMethodId?: number;
  @IsOptional() @IsString() reference?: string;
}

export class CreateQuickSaleDto extends CafeInvoiceClassificationDto {
  @IsOptional() @IsInt() @Min(0) expectedEmployeeFreeDrinks?: number;
  @IsInt() branchId!: number;
  @IsOptional() @IsString() customerName?: string;
  @IsOptional()
  @IsString()
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().replace(/[\s\-()]/g, "") : value,
  )
  @Matches(/^(?:01\d{9}|\+?[1-9]\d{6,14})$/, {
    message: "رقم الجوال غير صحيح. استخدم رقمًا محليًا أو دوليًا صالحًا",
  })
  customerPhone?: string;
  @IsOptional() @IsIn(["customer", "employee", "partner", "hospitality"]) saleType?:
    "customer" | "employee" | "partner" | "hospitality";
  @IsOptional() @IsInt() employeeId?: number;
  @IsOptional() @IsInt() partnerId?: number;
  // House hospitality "directed by / beneficiary" — reporting only, never billed.
  @IsOptional() @IsIn(["employee", "partner"]) hospitalityHostKind?: "employee" | "partner";
  @IsOptional() @IsInt() hospitalityHostId?: number;
  @IsOptional() @IsString() @MaxLength(150) hospitalityHostName?: string;
  @IsOptional() @IsIn(["immediate", "daily", "monthly"]) billingCycle?:
    "immediate" | "daily" | "monthly";
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuickSaleItemDto)
  items!: CreateQuickSaleItemDto[];
  @IsOptional() @IsNumber() @Min(0) discountPercentage?: number;
  @IsOptional() @IsNumber() @Min(0) taxPercentage?: number;
  @IsOptional()
  @IsIn(["cash", "card", "wallet", "transfer", "mixed"])
  paymentMethod?: string;
  @IsOptional() @IsInt() @Min(1) catalogPaymentMethodId?: number;
  @IsOptional() @IsString() @MaxLength(100) paymentReference?: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PosPaymentDto)
  payments?: PosPaymentDto[];
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() receiptComment?: string;
  /** One id per logical sale attempt; a retry with the same id returns the saved invoice. */
  @IsOptional() @IsString() @MaxLength(64) @Matches(/^[A-Za-z0-9_-]+$/) clientRequestId?: string;
  @IsOptional() @IsInt() warehouseId?: number;
  @IsOptional() @IsBoolean() onHold?: boolean;
  @IsOptional()
  @Transform(
    ({ value }) =>
      value === true || value === "true" || value === 1 || value === "1",
  )
  @IsBoolean()
  allowIngredientShortage?: boolean;
}

export class EditCompletedQuickSaleDto extends CreateQuickSaleDto {
  @IsInt() @Min(0) expectedRevision!: number;
}

export class InvoiceFeedbackDto {
  @IsInt() @Min(1) @Max(5) rating!: number;
  @IsOptional() @IsString() comment?: string;
}

export class InvoiceItemFeedbackLineDto {
  @IsInt() itemId!: number;
  @IsInt() @Min(1) @Max(5) rating!: number;
  @IsOptional() @IsString() comment?: string;
}

export class InvoiceItemFeedbackDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemFeedbackLineDto)
  items!: InvoiceItemFeedbackLineDto[];
}

export class UpdateQuickSaleDto {
  @IsIn(["refunded", "cancelled"]) status!: "refunded" | "cancelled";
  @IsString() @MinLength(3) notes!: string;
}
