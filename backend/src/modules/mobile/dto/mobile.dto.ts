import { IsInt, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

/**
 * Mobile login — same contract as the legacy Api.php `login` endpoint.
 * Mirrors auth/LoginDto; the actual auth work is delegated to AuthService.login.
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

/** Mobile leave input; the service delegates to the shared full leave workflow. */
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
