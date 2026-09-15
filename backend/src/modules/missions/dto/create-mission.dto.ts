import { IsInt, IsString } from 'class-validator';

/** Work mission form backed by the legacy tbl_mohmat_3mal table. */
export class CreateMissionDto {
  @IsString()
  name!: string;

  @IsString()
  missionDate!: string;

  @IsInt()
  empId!: number;

  @IsString()
  details!: string;
}
