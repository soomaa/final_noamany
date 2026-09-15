import { IsString, MaxLength, MinLength } from 'class-validator';

export class BlockClubMemberDto {
  @IsString()
  @MinLength(3, { message: 'سبب الحظر يجب ألا يقل عن 3 أحرف' })
  @MaxLength(500, { message: 'سبب الحظر يجب ألا يزيد عن 500 حرف' })
  reason!: string;
}
