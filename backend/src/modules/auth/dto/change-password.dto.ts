import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'كلمة المرور الحالية مطلوبة' })
  currentPassword!: string;

  @IsString()
  @IsNotEmpty({ message: 'كلمة المرور الجديدة مطلوبة' })
  @MinLength(6, { message: 'كلمة المرور الجديدة يجب أن تكون ٦ أحرف على الأقل' })
  @MaxLength(72, { message: 'كلمة المرور الجديدة لا يمكن أن تتجاوز 72 حرفًا' })
  newPassword!: string;
}
