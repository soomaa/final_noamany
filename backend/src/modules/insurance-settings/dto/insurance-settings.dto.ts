import { IsArray, IsInt, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class InsuranceSettingItemDto {
  @IsInt()
  settingId!: number;

  @IsOptional()
  @IsString()
  empAverage?: string;

  @IsOptional()
  @IsString()
  societyAverage?: string;
}

export class BulkReplaceInsuranceDto {
  @IsInt()
  nationalityType!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InsuranceSettingItemDto)
  items!: InsuranceSettingItemDto[];
}
