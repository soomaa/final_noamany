import { Type } from 'class-transformer';
import {
  Allow,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { FIELD_MAP } from '../employees.fieldmap';

/** Employee form is legacy-wide, but remains a strict allowlist rather than Record<string, unknown>. */
export class EmployeePayloadDto {
  [key: string]: unknown;
}

const EMPLOYEE_EXTRA_KEYS = [
  'addToSystem', 'add_to_system', 'systemUsername', 'username', 'systemPassword', 'password',
  'is_sales',
  'roleId', 'role_id', 'role_id_fk',
  'recruitmentApplicationId',
] as const;
for (const key of [...Object.keys(FIELD_MAP), ...EMPLOYEE_EXTRA_KEYS]) {
  Allow()(EmployeePayloadDto.prototype, key);
}

export class EmployeeFinanceRowDto {
  @IsOptional() @IsNumberString() id?: string;
  @IsOptional() @IsNumberString() badl_type?: string;
  @IsOptional() @IsNumberString() badl_discount_id_fk?: string;
  @IsOptional() @IsNumberString() badl_code?: string;
  @IsOptional() @IsNumberString() value?: string;
  @IsOptional() @IsIn(['fixed', 'percent', 'days']) method_to_count?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) date_from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) date_to?: string;
  @IsOptional() @IsIn([true, false, 0, 1, '0', '1']) insurance_affect?: boolean | number | string;
}

export class UpdateEmployeeFinanceDto {
  @IsString() @IsNumberString() basic_salary!: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => EmployeeFinanceRowDto)
  rows?: EmployeeFinanceRowDto[];
}

export class EmployeeScheduleDayDto {
  @IsInt() @Min(0) @Max(6) day!: number;
  @IsBoolean() enabled!: boolean;
  @Matches(/^\d{2}:\d{2}$/) startTime!: string;
  @Matches(/^\d{2}:\d{2}$/) endTime!: string;
}

export class UpdateEmployeeDwamDto {
  @IsOptional() @IsString() @MaxLength(50) shift_type?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => EmployeeScheduleDayDto)
  schedule?: EmployeeScheduleDayDto[];
}

export class EmployeeBankRowDto {
  @IsInt() @Min(1) bank_id_fk!: number;
  @IsString() @IsNotEmpty() @Matches(/^\d+$/) @MaxLength(100) bank_account_num!: string;
  @IsOptional() @IsString() @MaxLength(100) bank_code?: string;
  @IsOptional() @IsIn([true, false, 0, 1]) approved_for_sarf?: number | boolean;
  @IsOptional() @IsString() @MaxLength(255) emp_bank_name?: string;
  @IsOptional() @IsString() @Matches(/^file:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i) @MaxLength(500) bank_id_fk_image?: string;
}

export class UpdateEmployeeBanksDto {
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => EmployeeBankRowDto)
  rows?: EmployeeBankRowDto[];
}

export class EmployeeContractDto {
  [key: string]: unknown;
}
for (const key of [
  'num_days_in_month', 'hours_work', 'hour_value', 'work_period_id_fk', 'job_type',
  'pay_method_id_fk', 'bank_id_fk', 'bank_code', 'bank_account_num', 'year_vacation_num',
  'year_vacation_period', 'casual_vacation_num', 'travel_ticket', 'travel_type_fk',
  'travel_period', 'vacation_start_ar', 'vacation_start_m', 'vacation_start_h', 'travel_type_name',
  'contract_nature', 'reward_end_work', 'vacation_previous_balance',
]) {
  Allow()(EmployeeContractDto.prototype, key);
}

export class EmployeeDocumentRowDto {
  @IsOptional() @IsInt() @Min(1) id?: number;
  @IsOptional() @IsString() @MaxLength(300) file_type?: string;
  @IsOptional() @IsString() @MaxLength(300) file_name?: string;
  @IsOptional() @IsString() @MaxLength(500) file_path?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) expire_date?: string;
}

export class UpdateEmployeeDocumentsDto {
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => EmployeeDocumentRowDto)
  rows?: EmployeeDocumentRowDto[];
}
