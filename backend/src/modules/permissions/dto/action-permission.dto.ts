import { IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

/** A `wared` recipient acting on the multi-stage approval chain. */
export class ActionPermissionDto {
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
}

/** Edit + resubmit after «إرجاع للتعديل» (fields omitted stay unchanged). */
export class ResubmitPermissionDto {
  @IsOptional()
  @IsInt()
  @IsIn([1, 2])
  no3Ezn?: number;

  @IsOptional()
  @IsString()
  eznDate?: string;

  @IsOptional()
  @IsString()
  fromHour?: string;

  @IsOptional()
  @IsString()
  toHour?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsInt()
  fatraFk?: number;

  /** Reply to the return comment, shown in the timeline. */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}
