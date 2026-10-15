import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateClubGymPoliciesDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  outstandingGraceDays?: number;

  @IsOptional()
  @IsBoolean()
  allowCheckInWithOutstanding?: boolean;

  @IsOptional()
  @IsBoolean()
  allowGraceSessions?: boolean;

  @IsOptional()
  @IsBoolean()
  outstandingAlertEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  outstandingAlertAfterSubscriptionPercent?: number;

  @IsOptional()
  @IsBoolean()
  allowRefunds?: boolean;

  @IsOptional()
  @IsBoolean()
  allowSameGuestMultipleInvitations?: boolean;

  @IsOptional() @IsBoolean() requireExpenseApproval?: boolean;
  @IsOptional() @IsBoolean() restrictEmployeeFinancialVisibility?: boolean;
  @IsOptional() @IsBoolean() printSubscriptionReceipts?: boolean;
  @IsOptional() @IsBoolean() printSubscriptionPayments?: boolean;
  @IsOptional() @IsBoolean() printQuickServiceReceipts?: boolean;
  @IsOptional() @IsBoolean() printInbodyReceipts?: boolean;
  @IsOptional() @IsBoolean() printSpaReceipts?: boolean;
  @IsOptional() @IsBoolean() printLockerReceipts?: boolean;
  @IsOptional() @IsBoolean() printEventReceipts?: boolean;

  @IsOptional() @IsIn(['thermal', 'a4']) receiptPaperSize?: 'thermal' | 'a4';
  @IsOptional() @IsInt() @Min(1) @Max(2) receiptA4Copies?: 1 | 2;
  @IsOptional() @IsIn(['ar', 'en']) receiptLanguage?: 'ar' | 'en';
}
