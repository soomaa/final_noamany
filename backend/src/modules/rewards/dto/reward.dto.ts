import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  Max,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class RewardDetailDto {
  @IsInt()
  empCode!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  value?: number;
}

/**
 * Legacy reward form contract:
 * - recipientType 2 = selected employees, 3 = every active employee
 * - option rateb = paid with salary, alone = separate statement
 *
 * `details` remains accepted for backward compatibility with the first React page.
 */
export class CreateRewardDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @IsOptional()
  @IsInt()
  @IsIn([2, 3])
  recipientType?: number;

  @IsOptional()
  @IsInt()
  mokafaType?: number;

  @IsOptional()
  @IsString()
  @IsIn(['rateb', 'alone'])
  option?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  value?: number;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  employeeIds?: number[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RewardDetailDto)
  details?: RewardDetailDto[];
}

export class UpdateRewardDto extends CreateRewardDto {}
