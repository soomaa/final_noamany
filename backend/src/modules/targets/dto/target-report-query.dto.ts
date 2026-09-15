import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

export type TargetReportTab = 'subscriptions' | 'private' | 'sales' | 'sessions';

export class TargetReportQueryDto {
  @IsIn(['subscriptions', 'private', 'sales', 'sessions'])
  tab!: TargetReportTab;

  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  month!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  personId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  branchId?: number;

  @IsOptional()
  @IsIn(['male', 'female'])
  gender?: 'male' | 'female';

  @IsOptional()
  @Transform(({ value }) => Number(value ?? 1))
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Transform(({ value }) => Number(value ?? 25))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 25;
}

export class TargetPeopleQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  branchId?: number;

  @IsOptional()
  @IsIn(['male', 'female'])
  gender?: 'male' | 'female';
}
