import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  Validate,
  ValidateNested,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'receivedNotExceedsOrdered', async: false })
class ReceivedNotExceedsOrderedConstraint implements ValidatorConstraintInterface {
  validate(receivedQty: number, args: ValidationArguments) {
    const obj = args.object as GoodsReceiptItemDto;
    return typeof receivedQty === 'number' && typeof obj.orderedQty === 'number' && receivedQty <= obj.orderedQty;
  }

  defaultMessage() {
    return 'الكمية المستلمة لا يمكن أن تتجاوز الكمية المطلوبة';
  }
}
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class UpdateProcurementSettingsDto {
  @IsOptional() @IsInt() branchId?: number;
  @IsOptional() @IsBoolean() requireApproval?: boolean;
  @IsOptional() @IsNumber() @Min(0) approvalThreshold?: number;
  @IsOptional() @IsNumber() @Min(0) maxOrderAmount?: number;
  @IsOptional() @IsBoolean() requireVendorEvaluation?: boolean;
  @IsOptional() @IsInt() @Min(1) minQuotations?: number;
  @IsOptional() @IsBoolean() enableInventoryIntegration?: boolean;
  @IsOptional() @IsBoolean() enableThreeWayMatch?: boolean;
  @IsOptional() @IsNumber() @Min(0) matchTolerancePercent?: number;
  @IsOptional() @IsBoolean() notifyEmail?: boolean;
  @IsOptional() @IsBoolean() notifySms?: boolean;
  @IsOptional() @IsBoolean() notifyInSystem?: boolean;
}

export class ListSupplierCategoriesDto extends PaginationDto {
  @IsOptional() @IsString() active?: string;
}

export class UpsertSupplierCategoryDto {
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class ListSupplyRegionsDto extends PaginationDto {
  @IsOptional() @IsString() active?: string;
  @IsOptional() @IsString() country?: string;
}

export class UpsertSupplyRegionDto {
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() branches?: unknown;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class ListPaymentTermsDto extends PaginationDto {
  @IsOptional() @IsString() active?: string;
  @IsOptional() @IsString() type?: string;
}

export class UpsertPaymentTermDto {
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() @Min(0) days?: number;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsNumber() @Min(0) discountPercentage?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class ListRequisitionsDto extends PaginationDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() department?: string;
  @IsOptional() @IsString() branchId?: string;
}

export class RequisitionItemDto {
  @IsOptional() @IsInt() productId?: number;
  @IsString() name!: string;
  @IsNumber() @Min(0.001) quantity!: number;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsString() specifications?: string;
  @IsOptional() @IsNumber() @Min(0) estimatedPrice?: number;
}

export class UpsertRequisitionDto {
  @IsOptional() @IsString() requestNumber?: string;
  @IsOptional() @IsString() requestType?: string;
  @IsString() requestingDepartment!: string;
  @IsOptional() @IsString() requiredDate?: string;
  @IsOptional() @IsIn(['low', 'normal', 'high', 'urgent']) priority?: string;
  @IsInt() branchId!: number;
  @IsOptional() @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RequisitionItemDto)
  items?: RequisitionItemDto[];
}

export class ListRfqsDto extends PaginationDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() branchId?: string;
}

export class RfqItemDto {
  @IsOptional() @IsInt() productId?: number;
  @IsOptional() @IsString() itemCode?: string;
  @IsString() itemName!: string;
  @IsNumber() @Min(0.001) quantity!: number;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsNumber() @Min(0) estimatedPrice?: number;
}

export class UpsertRfqDto {
  @IsOptional() @IsString() rfqNumber?: string;
  @IsString() subject!: string;
  @IsString() requestingDepartment!: string;
  @IsOptional() @IsString() requiredDate?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsNumber() @Min(0) estimatedBudget?: number;
  @IsInt() branchId!: number;
  @IsOptional() @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RfqItemDto)
  items?: RfqItemDto[];
}

export class ImportRequisitionDto {
  @IsInt() requisitionId!: number;
}

export class ListQuotationsDto extends PaginationDto {
  @IsOptional() @IsString() rfqId?: string;
  @IsOptional() @IsString() status?: string;
}

export class UpsertQuotationDto {
  @IsInt() rfqId!: number;
  @IsInt() supplierId!: number;
  @IsNumber() @Min(0) totalPrice!: number;
  @IsOptional() @IsString() deliveryTime?: string;
  @IsOptional() @IsString() paymentTerms?: string;
  @IsOptional() @IsString() receivedDate?: string;
  @IsOptional() @IsString() status?: string;
}

export class ListApprovalsDto extends PaginationDto {
  @IsOptional() @IsString() status?: string;
}

export class ApprovalActionDto {
  @IsIn(['approve', 'reject', 'return'])
  action!: 'approve' | 'reject' | 'return';
  @IsOptional() @IsString() notes?: string;
}

export class PurchaseOrderItemDto {
  @IsOptional() @IsInt() productId?: number;
  @IsString() name!: string;
  @IsNumber() @Min(0.001) quantity!: number;
  @IsOptional() @IsString() unit?: string;
  @IsNumber() @Min(0) price!: number;
}

export class ListPurchaseOrdersDto extends PaginationDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() supplierId?: string;
  @IsOptional() @IsString() branchId?: string;
}

export class UpsertPurchaseOrderDto {
  @IsOptional() @IsString() poNumber?: string;
  @IsOptional() @IsInt() requisitionId?: number;
  @IsInt() supplierId!: number;
  @IsOptional() @IsString() expectedDeliveryDate?: string;
  @IsOptional() @IsString() paymentTerms?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsInt() branchId?: number;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemDto)
  items!: PurchaseOrderItemDto[];
}

export class ListGoodsReceiptsDto extends PaginationDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() purchaseOrderId?: string;
  @IsOptional() @IsString() branchId?: string;
}

export class GoodsReceiptItemDto {
  @IsOptional() @IsInt() productId?: number;
  @IsString() name!: string;
  @IsNumber() @Min(0) orderedQty!: number;
  @Validate(ReceivedNotExceedsOrderedConstraint)
  @IsNumber() @Min(0) receivedQty!: number;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsBoolean() rejected?: boolean;
}

export class UpsertGoodsReceiptDto {
  @IsOptional() @IsString() grnNumber?: string;
  @IsInt() purchaseOrderId!: number;
  @IsOptional() @IsInt() warehouseId?: number;
  @IsString() receiverName!: string;
  @IsOptional() @IsString() receiptDate?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsInt() branchId?: number;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GoodsReceiptItemDto)
  items!: GoodsReceiptItemDto[];
}

export class ChangeGoodsReceiptStatusDto {
  @IsIn(['draft', 'partial', 'completed', 'rejected'])
  status!: string;
}

export class PurchaseInvoiceItemDto {
  @IsString() name!: string;
  @IsNumber() @Min(0.001) quantity!: number;
  @IsNumber() @Min(0) price!: number;
  @IsOptional() @IsNumber() @Min(0) poQuantity?: number;
  @IsOptional() @IsNumber() @Min(0) grnQuantity?: number;
}

export class PaymentScheduleDto {
  @IsOptional() @IsString() scheduledDate?: string;
  @IsNumber() @Min(0) amount!: number;
  @IsOptional() @IsString() paymentMethod?: string;
  @IsOptional() @IsString() status?: string;
}

export class ListPurchaseInvoicesDto extends PaginationDto {
  @IsOptional() @IsString() supplierId?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() matchingStatus?: string;
}

export class UpsertPurchaseInvoiceDto {
  @IsOptional() @IsString() invoiceNumber?: string;
  @IsOptional() @IsString() invoiceDate?: string;
  @IsInt() supplierId!: number;
  @IsOptional() @IsInt() purchaseOrderId?: number;
  @IsOptional() @IsInt() goodsReceiptId?: number;
  @IsOptional() @IsString() dueDate?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() matchingStatus?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsInt() branchId?: number;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseInvoiceItemDto)
  items!: PurchaseInvoiceItemDto[];
  @IsOptional() @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentScheduleDto)
  paymentSchedules?: PaymentScheduleDto[];
}

export class DebitNoteItemDto {
  @IsString() name!: string;
  @IsNumber() @Min(0.001) quantity!: number;
  @IsNumber() @Min(0) unitPrice!: number;
}

export class ListDebitNotesDto extends PaginationDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() supplierId?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
}

export class UpsertDebitNoteDto {
  @IsOptional() @IsString() debitNumber?: string;
  @IsOptional() @IsString() debitDate?: string;
  @IsInt() supplierId!: number;
  @IsOptional() @IsInt() purchaseOrderId?: number;
  @IsOptional() @IsInt() invoiceId?: number;
  @IsString() reason!: string;
  @IsNumber() @Min(0) debitAmount!: number;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsInt() branchId?: number;
  @IsOptional() @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DebitNoteItemDto)
  items?: DebitNoteItemDto[];
}

export class ChangeDebitNoteStatusDto {
  @IsString() status!: string;
  @IsOptional() @IsString() notes?: string;
}

export class SendDebitNoteDto {
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsString() message?: string;
}

export class ListSupplierContractsDto extends PaginationDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() supplierId?: string;
}

export class UpsertSupplierContractDto {
  @IsOptional() @IsString() contractNumber?: string;
  @IsOptional() @IsInt() supplierId?: number;
  @IsOptional() @IsString() supplierName?: string;
  @IsString() startDate!: string;
  @IsString() endDate!: string;
  @IsOptional() @IsString() contractType?: string;
  @IsOptional() @IsNumber() @Min(0) contractValue?: number;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() notes?: string;
}

export class SupplierInvoiceItemDto {
  @IsOptional() @IsInt() productId?: number;
  @IsOptional() @IsInt() @Min(1) packageId?: number;
  @IsOptional() @IsString() productName?: string;
  @IsNumber() @Min(0.001) quantity!: number;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsNumber() @Min(0) unitPrice?: number;
  @IsOptional() @IsNumber() @Min(0) lineTotal?: number;
  @IsOptional() @IsIn(['replace', 'keep', 'weighted']) costUpdateMode?: 'replace' | 'keep' | 'weighted';
}

export class ListSupplierInvoicesDto extends PaginationDto {
  @IsOptional() @IsString() supplierId?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() branchId?: string;
}

export class UpsertSupplierInvoiceDto {
  @IsOptional() @IsString() invoiceNumber?: string;
  @IsOptional() @IsString() supplierInvoiceNumber?: string;
  @IsOptional() @IsString() attachmentUrl?: string;
  @IsInt() supplierId!: number;
  @IsOptional() @IsInt() branchId?: number;
  @IsOptional() @IsInt() warehouseId?: number;
  @IsOptional() @IsString() invoiceDate?: string;
  @IsOptional() @IsString() dueDate?: string;
  @IsOptional() @IsNumber() @Min(0) subtotal?: number;
  @IsOptional() @IsNumber() @Min(0) taxAmount?: number;
  @IsOptional() @IsNumber() @Min(0) discountAmount?: number;
  @IsOptional() @IsNumber() @Min(0) paidAmount?: number;
  @IsOptional() @IsString() initialPaymentMethod?: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SupplierInvoiceItemDto)
  items?: SupplierInvoiceItemDto[];
}

export class ListSupplierPaymentsDto extends PaginationDto {
  @IsOptional() @IsString() supplierId?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() branchId?: string;
}

export class UpsertSupplierPaymentDto {
  @IsOptional() @IsString() paymentNumber?: string;
  @IsInt() supplierId!: number;
  @IsOptional() @IsInt() invoiceId?: number;
  @IsOptional() @IsInt() branchId?: number;
  @IsOptional() @IsString() paymentDate?: string;
  @IsNumber() @Min(0) paymentAmount!: number;
  @IsOptional() @IsNumber() @Min(0) originalAmount?: number;
  @IsOptional() @IsString() currency?: string;
  @IsString() paymentMethod!: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() notes?: string;
}

export class SettleSupplierDebtDto {
  @IsInt() supplierId!: number;
  @IsOptional() @IsInt() branchId?: number;
  @IsNumber() @Min(0.01) paymentAmount!: number;
  @IsString() paymentMethod!: string;
  @IsOptional() @IsString() paymentDate?: string;
  @IsOptional() @IsString() notes?: string;
}

export class ListSupplierPaymentSchedulesDto extends PaginationDto {
  @IsOptional() @IsString() purchaseInvoiceId?: string;
  @IsOptional() @IsString() status?: string;
}

export class UpsertSupplierPaymentScheduleDto {
  @IsInt() purchaseInvoiceId!: number;
  @IsOptional() @IsString() scheduledDate?: string;
  @IsNumber() @Min(0) amount!: number;
  @IsOptional() @IsString() paymentMethod?: string;
  @IsOptional() @IsString() status?: string;
}

export class ProcurementLookupDto {
  @IsIn(['equipment', 'services', 'spares', 'materials'])
  type!: string;
  @IsOptional() @IsString() q?: string;
}

export class SupplierDashboardQueryDto {
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() supplierId?: string;
  @IsOptional() @IsInt() limit?: number;
  @IsOptional() @IsInt() days?: number;
  @IsOptional() @IsIn(['week', 'month', 'quarter', 'year']) period?: string;
}

export class SupplierReportsQueryDto extends PaginationDto {
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() riskLevel?: string;
}

