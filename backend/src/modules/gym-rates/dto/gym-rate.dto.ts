import { IsIn, IsNumber, IsOptional, Min } from 'class-validator';

export class CreateGymRateDto {
  @IsIn(['in', 'out']) ttype!: string;
  @IsNumber() @Min(0) forUser!: number;
  @IsNumber() @Min(0) forGym!: number;
}

export class UpdateGymRateDto {
  @IsOptional() @IsIn(['in', 'out']) ttype?: string;
  @IsOptional() @IsNumber() @Min(0) forUser?: number;
  @IsOptional() @IsNumber() @Min(0) forGym?: number;
}
