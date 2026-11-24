import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

/** The signed-in user's own display name (الملف الشخصي). The username never changes here. */
export class UpdateProfileNameDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2, { message: 'يجب أن يكون الاسم من حرفين إلى 100 حرف' })
  @MaxLength(100, { message: 'يجب أن يكون الاسم من حرفين إلى 100 حرف' })
  name!: string;
}
