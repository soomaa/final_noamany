import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateWeeklyLeaveDto {
  @IsInt() @Min(1) empId!: number;
  @IsString() @IsNotEmpty() @MaxLength(20) offDay!: string;
}

export class UpdateWeeklyLeaveDto {
  @IsOptional() @IsInt() @Min(1) empId?: number;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(20) offDay?: string;
}
