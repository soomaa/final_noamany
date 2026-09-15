import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpsertMembershipTypeDto {
  @IsNotEmpty({ message: 'اسم نوع العضوية مطلوب' })
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @Transform(({ value }) => Number(value))
  @IsNumber({}, { message: 'السعر مطلوب' })
  @Min(0)
  price!: number;

  @Transform(({ value }) => parseInt(value, 10))
  @IsInt({ message: 'مدة العضوية بالأيام مطلوبة' })
  @Min(1)
  durationDays!: number;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === 1 || value === '1')
  @IsBoolean()
  isActive?: boolean;
}
