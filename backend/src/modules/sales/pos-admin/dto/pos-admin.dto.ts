import {
  IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationDto } from '../../../../common/dto/pagination.dto';

export class PosListQueryDto extends PaginationDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsInt() @Type(() => Number) branchId?: number;
  @IsOptional() @IsBoolean() @Type(() => Boolean) isActive?: boolean;
}

// ── Devices ──
export class UpsertPosDeviceDto {
  @IsString() @MaxLength(100) name!: string;
  @IsOptional() @IsString() serialNumber?: string;
  @IsOptional() @IsString() deviceType?: string;
  @IsOptional() @IsInt() branchId?: number;
  @IsOptional() @IsInt() warehouseId?: number;
  @IsOptional() @IsString() cashDrawerId?: string;
  @IsOptional() @IsString() ipAddress?: string;
  @IsOptional() @IsString() printerType?: string;
  @IsOptional() @IsString() macAddress?: string;
  @IsOptional() @IsString() operatingSystem?: string;
  @IsOptional() @IsString() softwareVersion?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

// ── Payment methods ──
export class UpsertPosPaymentMethodDto {
  @IsString() @MaxLength(100) name!: string;
  @IsOptional() @IsString() nameEn?: string;
  @IsString() @MaxLength(40) code!: string;
  @IsOptional() @IsIn(['cash', 'card', 'wallet', 'transfer']) baseMethod?: 'cash' | 'card' | 'wallet' | 'transfer';
  @IsOptional() @IsString() icon?: string;
  @IsOptional() @IsNumber() fees?: number;
  @IsOptional() @IsNumber() maxAmount?: number;
  @IsOptional() @IsNumber() minAmount?: number;
  @IsOptional() @IsBoolean() supportsMixedPayment?: boolean;
  @IsOptional() @IsBoolean() requiresReference?: boolean;
  @IsOptional() @IsBoolean() requiresApproval?: boolean;
  @IsOptional() @IsNumber() approvalThreshold?: number;
  @IsOptional() @IsString() providerName?: string;
  @IsOptional() @IsString() apiKey?: string;
  @IsOptional() @IsString() apiSecret?: string;
  @IsOptional() @IsBoolean() isTestMode?: boolean;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() isEnabled?: boolean;
  @IsOptional() @IsInt() sortOrder?: number;
}

// ── Invoice templates ──
export class UpsertPosInvoiceTemplateDto {
  @IsString() @MaxLength(100) name!: string;
  @IsOptional() @IsString() templateType?: string;
  @IsOptional() @IsString() paperSize?: string;
  @IsOptional() @IsBoolean() includeHeader?: boolean;
  @IsOptional() @IsBoolean() includeLogo?: boolean;
  @IsOptional() @IsBoolean() includeFooter?: boolean;
  @IsOptional() @IsBoolean() includeQr?: boolean;
  @IsOptional() @IsBoolean() includeSignature?: boolean;
  @IsOptional() @IsString() headerText?: string;
  @IsOptional() @IsString() footerText?: string;
  @IsOptional() @IsString() cssStyles?: string;
  @IsOptional() layoutConfig?: Record<string, unknown>;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() sortOrder?: number;
}

// ── Report templates ──
export class UpsertPosReportTemplateDto {
  @IsString() @MaxLength(100) name!: string;
  @IsOptional() @IsString() reportType?: string;
  @IsOptional() @IsString() frequency?: string;
  @IsOptional() @IsBoolean() autoGenerate?: boolean;
  @IsOptional() recipients?: unknown[];
  @IsOptional() @IsString() format?: string;
  @IsOptional() schedule?: Record<string, unknown>;
  @IsOptional() parameters?: Record<string, unknown>;
  @IsOptional() filters?: Record<string, unknown>;
  @IsOptional() columns?: unknown[];
  @IsOptional() sorting?: Record<string, unknown>;
  @IsOptional() grouping?: Record<string, unknown>;
  @IsOptional() charts?: unknown[];
  @IsOptional() @IsString() watermark?: string;
  @IsOptional() @IsInt() retentionDays?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() sortOrder?: number;
}

// ── Notification rules ──
export class UpsertPosNotificationRuleDto {
  @IsString() @MaxLength(100) name!: string;
  @IsOptional() @IsString() notificationType?: string;
  @IsString() @MaxLength(60) trigger!: string;
  @IsOptional() @IsNumber() threshold?: number;
  @IsOptional() @IsString() thresholdType?: string;
  @IsOptional() channels?: unknown[];
  @IsOptional() recipients?: unknown[];
  @IsOptional() @IsString() messageTemplate?: string;
  @IsOptional() @IsString() subjectTemplate?: string;
  @IsOptional() conditions?: Record<string, unknown>;
  @IsOptional() schedule?: Record<string, unknown>;
  @IsOptional() @IsString() priority?: string;
  @IsOptional() @IsInt() cooldownMinutes?: number;
  @IsOptional() @IsInt() maxNotificationsPerHour?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() sortOrder?: number;
}

// ── Settings ──
export class SavePosSettingsDto {
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsInt() branchId?: number;
  @IsArray() settings!: Array<{ key: string; value: unknown; type?: string; description?: string }>;
}

export class CopyPosSettingsDto {
  @IsString() category!: string;
  @IsInt() fromBranchId!: number;
  @IsInt() toBranchId!: number;
}

export class UpdateOrderDto {
  @IsArray() orderData!: Array<{ id: number; sortOrder: number }>;
}

export class PreviewInvoiceDto {
  @IsOptional() sampleData?: Record<string, unknown>;
}

export class ScheduleReportDto {
  @IsOptional() schedule?: Record<string, unknown>;
  @IsOptional() @IsBoolean() autoGenerate?: boolean;
}

export class TestNotificationDto {
  @IsOptional() @IsString() message?: string;
  @IsOptional() recipients?: unknown[];
  @IsOptional() channels?: unknown[];
}

