import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

/** Account details only (تعديل on حسابات النظام): role, employee link and status are not changed here. */
export class UpdateAccountDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(3)
  @MaxLength(40)
  username!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  fullname!: string;

  @IsOptional()
  @ValidateIf((o) => o.password !== '' && o.password != null)
  @IsString()
  @MinLength(5)
  @MaxLength(72)
  password?: string;
}
