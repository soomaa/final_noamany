import { IsArray, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class RewardDetailDto {
  @IsInt()
  empCode!: number;

  // Reward value must be non-negative: a negative reward would be summed by the
  // engine (getMokafaaByDate) as a negative bonus, i.e. it would DEDUCT from pay.
  @IsOptional()
  @IsInt()
  @Min(0)
  value?: number;
}

export class CreateRewardDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsInt()
  mokafaType?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RewardDetailDto)
  details!: RewardDetailDto[];
}

export class UpdateRewardDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsInt()
  mokafaType?: number;
}
