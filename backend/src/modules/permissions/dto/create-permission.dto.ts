import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';

export class CreatePermissionDto {
  /** no3_ezn: 1 = استئذان شخصي (personal), 2 = استئذان للعمل (work). */
  @IsInt()
  @IsIn([1, 2])
  no3Ezn!: number;

  /** ezn_date (Gregorian date string yyyy-mm-dd). */
  @IsString()
  eznDate!: string;

  /** from_hour, to_hour as HH:mm (24h) or h:i A strings. */
  @IsString()
  fromHour!: string;

  @IsString()
  toHour!: string;

  @IsString()
  reason!: string;

  /** Target employee id (HR/admin only; otherwise the current user's employee). */
  @IsOptional()
  @IsInt()
  empId?: number;

  /** fatra_fk: 1 = morning, 2 = evening. */
  @IsOptional()
  @IsInt()
  fatraFk?: number;
}
