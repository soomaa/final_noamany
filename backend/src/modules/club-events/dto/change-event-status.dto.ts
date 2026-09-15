import { IsIn, IsOptional, IsString } from 'class-validator';

export class ChangeEventStatusDto {
  @IsIn([
    'pending_approval',
    'approved',
    'rejected',
    'published',
    'ongoing',
    'completed',
    'closed',
    'cancelled',
    'draft',
  ])
  status!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
