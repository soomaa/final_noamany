import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class ActionLeaveDto {
  /** `return` = «إرجاع للتعديل» back to the requester with a comment (required). */
  @IsString()
  @IsIn(['accept', 'reject', 'return'])
  action!: 'accept' | 'reject' | 'return';

  @IsOptional()
  @IsString()
  reason?: string;

  /** Alias of `reason` (mobile / unified card). */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;

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

/** Edit + resubmit after «إرجاع للتعديل» (fields omitted stay unchanged). */
export class ResubmitLeaveDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'صيغة التاريخ غير صحيحة' })
  startDate?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'صيغة التاريخ غير صحيحة' })
  endDate?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'صيغة التاريخ غير صحيحة' })
  returnToWorkDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;

  @IsOptional()
  @IsString()
  addressSinceAgaza?: string;

  /** Reply to the return comment, shown in the timeline. */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}
