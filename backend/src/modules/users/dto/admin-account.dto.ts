import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class VerifyAdminPasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  currentPassword!: string;
}

/** «Add Admin»: a standalone level-1 login with no employee file (MetaFit's flow). */
export class CreateAdminAccountDto extends VerifyAdminPasswordDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(3)
  @MaxLength(40)
  username!: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(100)
  fullname?: string;

  @IsString()
  @MinLength(5)
  @MaxLength(72)
  password!: string;
}
