import { IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class MemberLoginDto {
  @IsString()
  @IsNotEmpty({ message: 'رقم الجوال مطلوب' })
  phone!: string;

  @IsString()
  @IsNotEmpty({ message: 'كلمة المرور مطلوبة' })
  password!: string;
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
