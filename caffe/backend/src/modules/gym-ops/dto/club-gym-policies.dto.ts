import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateClubGymPoliciesDto {
  @IsOptional()
  @IsBoolean()
  allowCheckInWithOutstanding?: boolean;

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
}
