import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** Register / refresh the caller's mobile push token (users.device_token). */
export class RegisterTokenDto {
  @IsString()
  @IsNotEmpty()
  token!: string;
}

/**
 * Admin compose → send a push notification to a set of users.
 * Target is "all users" by default, or a single branch when branchId is set
 * (resolved against users.branch_id_fk).
 */
export class BroadcastDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  body!: string;

  /** tbl_branches.branch_id — when omitted, broadcast to all users. */
  @IsOptional()
  @IsInt()
  branchId?: number;
}

/** POST /member/device-token — member app (أنا نعماني) FCM token. */
export class MemberDeviceTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  token!: string;

  @IsIn(['android', 'ios'])
  platform!: 'android' | 'ios';

  @IsOptional()
  @IsString()
  @MaxLength(40)
  appVersion?: string;
}

/** DELETE /member/device-token */
export class MemberDeviceTokenDeleteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  token!: string;
}
