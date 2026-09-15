import { AccountType, JournalEntryStatus } from "@prisma/client";
import { Transform, Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { PaginationDto } from "../../../common/dto/pagination.dto";

export class ListAccountsDto extends PaginationDto {
  @IsOptional()
  @Transform(({ value }) =>
    value != null && value !== "" ? parseInt(value, 10) : undefined,
  )
  @IsInt()
  branchId?: number;

  @IsOptional()
  @IsIn(["asset", "liability", "equity", "revenue", "expense"])
  type?: AccountType;

  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  postableOnly?: boolean;
}

export class CreateAccountDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string;

  @IsString()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @Transform(({ value }) =>
    value != null && value !== "" ? parseInt(value, 10) : undefined,
  )
  @IsInt()
  parentId?: number;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Transform(({ value }) =>
    value != null && value !== "" ? parseInt(value, 10) : undefined,
  )
  @IsInt()
  branchId?: number;
}

export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Transform(({ value }) =>
    value != null && value !== "" ? parseInt(value, 10) : undefined,
  )
  @IsInt()
  branchId?: number;
}

export class NextCodeQueryDto {
  @IsOptional()
  @Transform(({ value }) =>
    value != null && value !== "" ? parseInt(value, 10) : undefined,
  )
  @IsInt()
  parentId?: number;
}

export class JournalLineDto {
  @IsOptional()
  @Transform(({ value }) =>
    value != null && value !== "" ? parseInt(value, 10) : undefined,
  )
  @IsInt()
  accountId?: number;

  @IsOptional()
  @IsString()
  accountCode?: string;

  @IsOptional()
  @Transform(({ value }) => parseFloat(value))
  @IsNumber()
  @Min(0)
  debit?: number;

  @IsOptional()
  @Transform(({ value }) => parseFloat(value))
  @IsNumber()
  @Min(0)
  credit?: number;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpsertJournalEntryDto {
  @IsString()
  @MaxLength(10)
  date!: string;

  @IsOptional()
  @Transform(({ value }) =>
    value != null && value !== "" ? parseInt(value, 10) : undefined,
  )
  @IsInt()
  branchId?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => JournalLineDto)
  lines!: JournalLineDto[];
}

export class ListJournalEntriesDto extends PaginationDto {
  @IsOptional()
  @IsIn(["draft", "posted", "reversed"])
  status?: JournalEntryStatus;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;

  @IsOptional()
  @Transform(({ value }) =>
    value != null && value !== "" ? parseInt(value, 10) : undefined,
  )
  @IsInt()
  branchId?: number;

  @IsOptional()
  @IsString()
  sourceModule?: string;
}

export class ReverseJournalEntryDto {
  @IsString()
  reason!: string;
}

export class CreateAccountingPeriodDto {
  @IsOptional()
  @Transform(({ value }) =>
    value != null && value !== "" ? parseInt(value, 10) : undefined,
  )
  @IsInt()
  @Min(2000)
  @Max(9999)
  year?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  name?: string;

  @IsOptional()
  @IsString()
  @IsDateString()
  @MaxLength(10)
  startDate?: string;

  @IsOptional()
  @IsString()
  @IsDateString()
  @MaxLength(10)
  endDate?: string;
}

export class ReportDateRangeDto {
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;

  @IsOptional()
  @Transform(({ value }) =>
    value != null && value !== "" ? parseInt(value, 10) : undefined,
  )
  @IsInt()
  branchId?: number;
}

export class AccountStatementQueryDto extends ReportDateRangeDto {
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  accountId!: number;

  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  includeChildren?: boolean;
}

export class GeneralLedgerQueryDto extends ReportDateRangeDto {
  @IsOptional()
  @Transform(({ value }) =>
    value != null && value !== "" ? parseInt(value, 10) : undefined,
  )
  @IsInt()
  accountId?: number;
}

export class BalanceSheetQueryDto {
  @IsString()
  asOfDate!: string;

  @IsOptional()
  @Transform(({ value }) =>
    value != null && value !== "" ? parseInt(value, 10) : undefined,
  )
  @IsInt()
  branchId?: number;
}

export class UpdateAccountingSettingsDto {
  @IsOptional()
  @IsString()
  @Matches(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/)
  fiscalYearStart?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  baseCurrency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  currencySymbol?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === "true")
  @IsBoolean()
  requireApproval?: boolean;

  @IsOptional()
  @IsObject()
  defaultAccounts?: Record<string, string>;
}

export class CreatePeriodDto {
  @IsString()
  name!: string;

  @IsString()
  startDate!: string;

  @IsString()
  endDate!: string;
}
