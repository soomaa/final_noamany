import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty({ message: 'اسم المستخدم مطلوب' })
  @MinLength(3, { message: 'اسم المستخدم قصير جدًا' })
  username!: string;

  @IsString()
  @IsNotEmpty({ message: 'كلمة المرور مطلوبة' })
  @MinLength(3, { message: 'كلمة المرور قصيرة جدًا' })
  password!: string;
}
