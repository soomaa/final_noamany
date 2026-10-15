import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  ArrayMinSize,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ListPartnersDto extends PaginationDto {
  @IsOptional()
  @IsIn(['all', 'active', 'inactive'])
  status: 'all' | 'active' | 'inactive' = 'all';
}

export class PartnerPhoneDto {
  @IsString()
  @Transform(({ value }) => String(value ?? '').trim().replace(/[\s()-]/g, ''))
  @Matches(/^\+?[0-9]{7,15}$/, { message: 'رقم الهاتف يجب أن يحتوي من 7 إلى 15 رقمًا' })
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  label?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class UpsertPartnerDto {
  @IsOptional()
  @IsString()
  @MaxLength(30)
  partnerCode?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  nationalId?: string;

  @IsOptional()
  @IsEmail({}, { message: 'البريد الإلكتروني غير صحيح' })
  @MaxLength(150)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsArray()
  @ArrayMinSize(1, { message: 'أضف رقم هاتف واحدًا على الأقل' })
  @ValidateNested({ each: true })
  @Type(() => PartnerPhoneDto)
  phones!: PartnerPhoneDto[];
}
