import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, Length } from 'class-validator';

export class UpsertClubMemberDto {
  @Transform(({ value }) => (value != null && value !== '' ? Number(value) : undefined))
  @IsInt()
  branchId!: number;

  @IsString()
  name!: string;

  @IsString()
  phone!: string;

  @IsIn(['male', 'female'])
  gender!: 'male' | 'female';

  @IsOptional()
  @IsString()
  cardNumber?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  profilePicture?: string;

  @Transform(({ value }) => (value != null && value !== '' ? Number(value) : undefined))
  @IsOptional()
  @IsInt()
  membershipTypeId?: number;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  maritalStatus?: string;

  @IsOptional()
  @IsString()
  jobTitle?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === 1 || value === '1')
  @IsBoolean()
  autoCreateUser?: boolean;

  /** Mobile-app password typed by reception. On add: blank keeps the default (the phone number).
   *  On edit: sets a new password (or creates the app account when the member has none). */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || undefined : value))
  @IsString()
  @Length(4, 72, { message: 'كلمة مرور التطبيق من 4 إلى 72 حرف/رقم' })
  appPassword?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === 1 || value === '1')
  @IsBoolean()
  isActive?: boolean;

  @Transform(({ value }) => (value != null && value !== '' ? Number(value) : undefined))
  @IsOptional()
  @IsInt()
  salesId?: number;

  @Transform(({ value }) => (value != null && value !== '' ? Number(value) : undefined))
  @IsOptional()
  @IsInt()
  employeeId?: number;

  @IsOptional()
  @IsString()
  guardianName?: string;

  @IsOptional()
  @IsString()
  guardianPhone?: string;
}
