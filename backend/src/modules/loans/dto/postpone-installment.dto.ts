import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

/**
 * Postponement (تأجيل قسط) — mirrors Solaf_requests_model::make_tagel_transformation_direct.
 * `fe2a` selects one of 4 redistribution modes:
 *   1 = أضف القسط على الشهر التالي  (double the next month's installment)
 *   2 = أضف القسط على آخر شهر       (double the last unpaid installment)
 *   3 = إعادة توزيع على كل الأقساط   (redistribute equally over remaining unpaid)
 *   4 = إضافة شهر جديد في النهاية     (append a brand-new month at the end)
 */
export class PostponeInstallmentDto {
  /** Postponement mode (legacy `fe2a`). */
  @IsInt()
  @IsIn([1, 2, 3, 4])
  mode!: number;

  /** The month (hr_solaf_quest.month) being postponed. */
  @IsInt()
  @Min(1)
  month!: number;

  @IsOptional()
  @IsString()
  reason?: string;
}
