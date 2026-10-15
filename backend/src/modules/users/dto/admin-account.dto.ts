import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class VerifyAdminPasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  currentPassword!: string;
}

export class CreateAdminAccountDto extends VerifyAdminPasswordDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(5)
  @MaxLength(40)
  @Matches(/^(?!_retired_)/i, { message: 'اسم المستخدم غير متاح' })
  username!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(72)
  password!: string;
}

