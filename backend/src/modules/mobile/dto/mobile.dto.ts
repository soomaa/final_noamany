import { Transform } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Standalone employee-app login. It never falls back to club-member authentication.
 */
export class MobileLoginDto {
  @IsString()
  @IsNotEmpty({ message: 'اسم المستخدم مطلوب' })
  @MinLength(3, { message: 'اسم المستخدم قصير جدًا' })
  username!: string;

  @IsString()
  @IsNotEmpty({ message: 'كلمة المرور مطلوبة' })
  @MinLength(3, { message: 'كلمة المرور قصيرة جدًا' })
  password!: string;
}

/** Register/refresh the FCM device token on users.device_token (legacy `update_token`). */
export class DeviceTokenDto {
  @IsString()
  @IsNotEmpty({ message: 'رمز الجهاز مطلوب' })
  token!: string;
}

/** Mobile leave request; execution is delegated to the full leaves workflow. */
export class CreateLeaveDto {
  @IsInt()
  leaveTypeId!: number;

  @IsString()
  @IsNotEmpty({ message: 'تاريخ البداية مطلوب' })
  startDate!: string;

  @IsString()
  @IsNotEmpty({ message: 'تاريخ النهاية مطلوب' })
  endDate!: string;

  @IsOptional()
  @IsString()
  reason?: string;

  /** Optional medical-report details. The employee may submit a sick leave before uploading it. */
  @IsOptional()
  @IsString()
  maradName?: string;

  @IsOptional()
  @IsString()
  hospitalName?: string;

  /** Path returned by POST /api/uploads/document for an image or document. */
  @IsOptional()
  @IsString()
  hospitalReport?: string;
}

/** GPS attendance punch; employee identity always comes from the JWT. */
export class MobileAttendancePunchDto {
  @IsString()
  @IsNotEmpty({ message: 'خط العرض مطلوب' })
  lat!: string;

  @IsString()
  @IsNotEmpty({ message: 'خط الطول مطلوب' })
  long!: string;

  @IsOptional()
  @IsString()
  photo?: string;
}

/** A single GPS punch captured locally while the employee app was offline. */
export class MobileOfflineAttendanceSyncDto extends MobileAttendancePunchDto {
  @IsUUID('4', { message: 'معرّف البصمة المؤجلة يجب أن يكون UUID v4' })
  offlineId!: string;

  @IsISO8601({ strict: true }, { message: 'وقت التقاط البصمة غير صحيح' })
  capturedAtUtc!: string;

  @IsString()
  @IsNotEmpty({ message: 'المنطقة الزمنية مطلوبة' })
  @MaxLength(64)
  timezone!: string;
}

export class MobileDailyTaskDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  notes!: string;

  @IsIn(['inprogress', 'done'])
  status!: 'inprogress' | 'done';
}

export class MobileListDto {
  @IsOptional()
  @Transform(({ value }) => (value == null || value === '' ? 1 : Number(value)))
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Transform(({ value }) => (value == null || value === '' ? 20 : Number(value)))
  @IsInt()
  @Min(1)
  perPage = 20;

  @IsOptional()
  @IsString()
  status?: string;
}

/** Common filters for employee-owned attendance reports. */
export class MobileAttendanceReportListDto extends MobileListDto {
  @IsOptional()
  @IsISO8601({ strict: true })
  dateFrom?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  dateTo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

/** Employee-created activity. Files are paths returned by POST /api/uploads/activity. */
export class MobileActivityDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  files?: string[];
}

/** Optional month filter for the authenticated employee dashboard. */
export class MobileMonthlyStatisticsDto {
  @IsOptional()
  @Transform(({ value }) => (value == null || value === '' ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @IsOptional()
  @Transform(({ value }) => (value == null || value === '' ? undefined : Number(value)))
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;
}

/** Employee self-service shift-change request; employee identity is derived from the JWT. */
export class MobileShiftSwapDto {
  /** Target employee selected by their phone number; manager/HR authorization is checked server-side. */
  @IsString()
  @IsNotEmpty()
  employeePhone!: string;

  @Transform(({ value }) => Number(value))
  @IsInt()
  @IsIn([1, 2])
  ttype!: 1 | 2;

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  dwamIdFk!: number;

  @IsString()
  @IsNotEmpty()
  sheftDate!: string;
}

/** Manager/HR overtime entry for an employee under their authority. */
export class MobileExtraHoursDto {
  @IsString()
  @IsNotEmpty()
  employeePhone!: string;

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  numHours!: number;

  @IsString()
  @IsNotEmpty()
  edafaDate!: string;
}

/** Internal message. Recipient IDs are users.user_id values from /mobile/employees. */
export class MobileMessageDto {
  @IsArray()
  @ArrayMinSize(1)
  @Transform(({ value }) => (Array.isArray(value) ? value.map(Number) : value))
  @IsInt({ each: true })
  toUserIds!: number[];

  @IsString()
  @IsNotEmpty()
  subject!: string;

  @IsString()
  @IsNotEmpty()
  message!: string;

  @IsOptional()
  @IsString()
  file?: string;
}

/** Employee loan request. Repayment: 1 cash, 2 once from salary, 3 monthly. */
export class MobileLoanRequestDto {
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  amount!: number;

  @Transform(({ value }) => Number(value))
  @IsInt()
  @IsIn([1, 2, 3])
  repaymentMethod!: 1 | 2 | 3;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  reason!: string;

  @IsOptional()
  @Transform(({ value }) => (value == null || value === '' ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  installments?: number;

  @IsOptional()
  @IsString()
  deductionStartDate?: string;
}

export class MobileLoanActionDto {
  @IsIn(['accept', 'reject'])
  action!: 'accept' | 'reject';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  reason?: string;
}

export class MobileLoanListDto extends MobileListDto {
  @IsOptional()
  @IsIn(['sader', 'wared', 'accept', 'reject', 'cancelled'])
  mode: 'sader' | 'wared' | 'accept' | 'reject' | 'cancelled' = 'sader';
}

/** Field-employee location punch (legacy Api.php `send_visit` / `location_visit`). */
export class CreateVisitDto {
  @IsString()
  @IsNotEmpty({ message: 'خط العرض مطلوب' })
  lat!: string;

  @IsString()
  @IsNotEmpty({ message: 'خط الطول مطلوب' })
  long!: string;

  @IsOptional()
  @IsString()
  img?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
