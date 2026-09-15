import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class StartShiftSessionDto {
  @IsInt() shiftId!: number;
  @IsOptional() @IsInt() branchId?: number;
  @IsOptional() @IsNumber() @Min(0) openingBalance?: number;
  @IsOptional() @IsString() notes?: string;
}

export class CloseShiftSessionDto {
  @IsNumber() @Min(0) closingBalance!: number;
  @IsOptional() @IsNumber() @Min(0) cashDropAmount?: number;
  @IsOptional() @IsNumber() @Min(0) retainedAmount?: number;
  @IsOptional() @IsString() closingNotes?: string;
  @IsOptional() @IsString() @MaxLength(1000) shortageReason?: string;
}

export class SwitchShiftSessionDto {
  @IsInt() targetShiftId!: number;
  @IsOptional() @IsInt() branchId?: number;
  @IsString() @MaxLength(80) username!: string;
  @IsString() @MaxLength(200) password!: string;
  @IsNumber() @Min(0) closingBalance!: number;
  @IsNumber() @Min(0) transferAmount!: number;
  @IsNumber() @Min(0) cashDropAmount!: number;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsOptional() @IsString() @MaxLength(1000) shortageReason?: string;
}

export class CreateDrawerMovementDto {
  @IsInt() sessionId!: number;
  @IsIn(['petty_expense', 'custody_issue', 'custody_return']) movementType!:
    | 'petty_expense'
    | 'custody_issue'
    | 'custody_return';
  @IsNumber() @Min(0.01) amount!: number;
  @IsOptional() @IsIn(['maintenance', 'emergency_service', 'urgent_purchase', 'supplies', 'other']) category?: string;
  @IsOptional() @IsInt() employeeId?: number;
  @IsOptional() @IsInt() sourceTransactionId?: number;
  @IsString() @MaxLength(1000) description!: string;
}

export class OpenCustodiesQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() branchId?: number;
  @IsOptional() @Type(() => Number) @IsInt() employeeId?: number;
}

export class ListDrawerMovementsDto extends PaginationDto {
  @IsOptional() @Type(() => Number) @IsInt() sessionId?: number;
  @IsOptional() @Type(() => Number) @IsInt() branchId?: number;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
}

export class ListShiftSessionsDto extends PaginationDto {
  @IsOptional() @Type(() => Number) @IsInt() branchId?: number;
  @IsOptional() @Type(() => Number) @IsInt() shiftId?: number;
  @IsOptional() @IsIn(['open', 'closed', 'auto_closed', 'all']) status?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
}

export class ShiftSessionsReportQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() branchId?: number;
  @IsOptional() @Type(() => Number) @IsInt() shiftId?: number;
  @IsOptional() @Type(() => Number) @IsInt() userId?: number;
  @IsOptional() @IsIn(['open', 'closed', 'auto_closed', 'all']) status?: string;
  @IsOptional() @IsIn(['all', 'balanced', 'shortage', 'surplus']) difference?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
}

export class CurrentSessionQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() branchId?: number;
  @IsOptional() @Type(() => Number) @IsInt() userId?: number;
}

export class DailyReportQueryDto {
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @Type(() => Number) @IsInt() branchId?: number;
}
