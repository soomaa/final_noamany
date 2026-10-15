import { IsInt, IsOptional, IsString } from 'class-validator';

export class CreateWarningDto {
  @IsInt()
  empId!: number;

  @IsInt()
  typeId!: number;

  @IsOptional()
  @IsString()
  details?: string;

  @IsOptional()
  @IsString()
  date?: string;
}

export class SendToEmpDto {
  @IsOptional()
  @IsString()
  hrNotes?: string;
}
