import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class MemberLoginDto {
  /** Canonical mobile-app login field. */
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'رقم الجوال مطلوب' })
  phone?: string;

  /**
   * Compatibility alias for released mobile clients whose login form labels
   * the phone number as "username".  Member usernames are phone numbers.
   */
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'اسم المستخدم مطلوب' })
  username?: string;

  @IsString()
  @IsNotEmpty({ message: 'كلمة المرور مطلوبة' })
  password!: string;

  /** Optional: sign straight into one branch when the phone owns memberships in several. */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'الفرع غير صحيح' })
  @Min(1, { message: 'الفرع غير صحيح' })
  branchId?: number;
}

/** Second step of a multi-branch login: the picker's choice. */
export class MemberSelectBranchDto {
  @IsString()
  @IsNotEmpty({ message: 'انتهت مهلة اختيار الفرع، سجّل الدخول مرة أخرى' })
  selectionToken!: string;

  @Type(() => Number)
  @IsInt({ message: 'الفرع غير صحيح' })
  @Min(1, { message: 'الفرع غير صحيح' })
  memberId!: number;
}

/** In-app branch switch to another membership proved at login. */
export class MemberSwitchBranchDto {
  @Type(() => Number)
  @IsInt({ message: 'الفرع غير صحيح' })
  @Min(1, { message: 'الفرع غير صحيح' })
  memberId!: number;
}

/** PUT|POST /member/trainers/:id/rating — the member's own single rating for that trainer. */
export class MemberRateTrainerDto {
  @Type(() => Number)
  @IsInt({ message: 'التقييم يجب أن يكون رقمًا صحيحًا من 1 إلى 5' })
  @Min(1, { message: 'التقييم يجب أن يكون بين 1 و 5' })
  @Max(5, { message: 'التقييم يجب أن يكون بين 1 و 5' })
  rating!: number;

  @IsOptional()
  @IsString({ message: 'التعليق غير صالح' })
  @MaxLength(1000, { message: 'التعليق يجب ألا يزيد عن 1000 حرف' })
  comment?: string;
}

export class MemberChangePasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'كلمة المرور الحالية مطلوبة' })
  currentPassword!: string;

  @IsString()
  @IsNotEmpty({ message: 'كلمة المرور الجديدة مطلوبة' })
  @MinLength(6, { message: 'كلمة المرور الجديدة يجب أن تكون ٦ أحرف على الأقل' })
  newPassword!: string;
}

export class MemberDeleteAccountDto {
  @IsString()
  @IsNotEmpty({ message: 'كلمة المرور مطلوبة لحذف الحساب' })
  password!: string;
}

export class MemberCreateInvitationDto {
  @IsString()
  @IsNotEmpty({ message: 'اسم المدعو مطلوب' })
  recipientName!: string;

  @IsString()
  @IsNotEmpty({ message: 'رقم جوال المدعو مطلوب' })
  recipientPhone!: string;

  @IsOptional()
  @IsString()
  recipientEmail?: string;
}
