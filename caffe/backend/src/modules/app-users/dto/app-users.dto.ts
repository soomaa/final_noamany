import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import { ListQueryDto } from '../../../common/dto/list-query.dto';

/**
 * Mobile-app users list query. Extends ListQueryDto so `status` ('0' | '1')
 * filters the list and search hits user_name / user_phone / user_email.
 */
export class ListAppUsersDto extends ListQueryDto {}

export class CreateAppUserDto {
  @IsString()
  name!: string;

  @IsString()
  phone!: string;

  @IsString()
  email!: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsString()
  password!: string;
}

export class UpdateAppUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  city?: string;

  /** Optional — when present the password is re-hashed and stored. */
  @IsOptional()
  @IsString()
  password?: string;
}

/** Activate (1) / deactivate (0) a mobile-app user. */
export class UpdateAppUserStatusDto {
  @IsInt()
  @IsIn([0, 1])
  status!: number;
}
