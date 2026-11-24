import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator';

export class ListOfflinePunchesDto {
  @IsOptional()
  @IsIn(['pending', 'approved', 'rejected', 'all'])
  status?: 'pending' | 'approved' | 'rejected' | 'all';

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateFrom?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateTo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  branchId?: string;
}

export class ApproveOfflinePunchesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  ids!: number[];
}

export class RejectOfflinePunchDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
