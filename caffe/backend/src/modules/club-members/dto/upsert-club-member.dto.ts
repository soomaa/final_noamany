import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString } from 'class-validator';

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
