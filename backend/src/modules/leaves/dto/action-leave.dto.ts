import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

export class ActionLeaveDto {
  @IsString()
  @IsIn(['accept', 'reject'])
  action!: 'accept' | 'reject';

  @IsOptional()
  @IsString()
  reason?: string;

  /** Partial approval (accept only): approved first day, inside the requested range. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'صيغة التاريخ غير صحيحة' })
  startDate?: string;

  /** Partial approval (accept only): approved last day, inside the requested range. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'صيغة التاريخ غير صحيحة' })
  endDate?: string;
}

/** Body of POST /leaves/:id/approve and /reject (all optional). */
export class ApproveLeaveDto {
  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'صيغة التاريخ غير صحيحة' })
  startDate?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'صيغة التاريخ غير صحيحة' })
  endDate?: string;
}
