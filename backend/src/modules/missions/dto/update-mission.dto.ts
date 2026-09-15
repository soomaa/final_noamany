import { IsInt, IsOptional, IsString } from 'class-validator';

export class UpdateMissionDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  missionDate?: string;

  @IsOptional()
  @IsInt()
  empId?: number;

  @IsOptional()
  @IsString()
  details?: string;
}
