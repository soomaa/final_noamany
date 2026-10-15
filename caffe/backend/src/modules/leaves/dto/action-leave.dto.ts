import { IsIn, IsOptional, IsString } from 'class-validator';

export class ActionLeaveDto {
  @IsString()
  @IsIn(['accept', 'reject'])
  action!: 'accept' | 'reject';

  @IsOptional()
  @IsString()
  reason?: string;
}
