import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Body of `DELETE /club-subscriptions/:id/purge` — remove a subscription created by mistake. */
export class PurgeClubSubscriptionDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'سبب الحذف مطلوب' })
  @MinLength(5, { message: 'اكتب سبب الحذف (5 حروف على الأقل)' })
  @MaxLength(500)
  reason!: string;

  /** Optional: keep the member's visits by moving them to another subscription of the same member. */
  @IsOptional()
  @Transform(({ value }) => (value === '' || value == null ? undefined : Number(value)))
  @IsInt()
  moveAttendanceToSubscriptionId?: number;
}
