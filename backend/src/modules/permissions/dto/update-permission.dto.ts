import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';

/** Editable fields of a permission request. The employee remains fixed after submission. */
export class UpdatePermissionDto {
  @IsInt()
  @IsIn([1, 2])
  no3Ezn!: number;

  @IsString()
  eznDate!: string;

  @IsString()
  fromHour!: string;

  @IsString()
  toHour!: string;

  @IsString()
  reason!: string;

  @IsOptional()
  @IsInt()
  fatraFk?: number;
}
