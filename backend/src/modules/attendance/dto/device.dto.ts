import { IsIP, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateAttendanceDeviceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  title!: string;

  @IsIP(undefined, { message: 'عنوان الجهاز يجب أن يكون IP صريحًا صالحًا' })
  ip!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  branchId?: number;
}
