import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsIP,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateGateControllerDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  branchId!: number;

  @IsOptional()
  @IsString()
  @IsIn(['C3-200', 'INBIO160-PRO', 'INBIO260-PRO'])
  model?: string;

  /** Required for the Windows agent; informational for a push controller. */
  @IsOptional()
  @IsIP()
  staticIp?: string;

  /** "agent" = Windows PullSDK agent; "push" = the controller calls /iclock over HTTP. */
  @IsOptional()
  @IsIn(['agent', 'push'])
  connectionMode?: 'agent' | 'push';

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9]{4,80}$/, { message: 'الرقم التسلسلي حروف وأرقام إنجليزية فقط' })
  serialNumber?: string;

  /** Empty string clears the lock. */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Matches(/^$|^(?:\d{1,3}\.){3}\d{1,3}$/, { message: 'IP غير صحيح' })
  pushAllowedIp?: string;

  @IsOptional()
  @IsIn(['Africa/Cairo', 'Asia/Riyadh', 'Asia/Dubai', 'Asia/Kuwait', 'Asia/Baghdad', 'UTC'])
  timezone?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2)
  entryDoorNo?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2)
  exitDoorNo?: number;
}

export class UpdateGateControllerDto {
  @IsOptional()
  @IsIn(['C3-200', 'INBIO160-PRO', 'INBIO260-PRO'])
  model?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  branchId?: number;

  @IsOptional()
  @IsIP()
  staticIp?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2)
  entryDoorNo?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2)
  exitDoorNo?: number;

  /** "agent" = Windows PullSDK agent; "push" = the controller calls /iclock over HTTP. */
  @IsOptional()
  @IsIn(['agent', 'push'])
  connectionMode?: 'agent' | 'push';

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9]{4,80}$/, { message: 'الرقم التسلسلي حروف وأرقام إنجليزية فقط' })
  serialNumber?: string;

  /** Empty string clears the lock. */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Matches(/^$|^(?:\d{1,3}\.){3}\d{1,3}$/, { message: 'IP غير صحيح' })
  pushAllowedIp?: string;

  @IsOptional()
  @IsIn(['Africa/Cairo', 'Asia/Riyadh', 'Asia/Dubai', 'Asia/Kuwait', 'Asia/Baghdad', 'UTC'])
  timezone?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isActive?: boolean;
}

export class OpenGateDoorDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2)
  doorNo!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  seconds?: number;
}

export class GateHeartbeatDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  agentVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  firmwareVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  serialNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  lastError?: string;

  @IsOptional()
  @IsIn(['online', 'controller_offline', 'error'])
  status?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  synced?: boolean;
}

export class GateEventDto {
  @IsString()
  @MaxLength(64)
  fingerprint!: string;

  @IsString()
  @MaxLength(30)
  occurredAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  credentialNo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(4)
  doorNo?: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(255)
  eventType!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  inOutState?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  verifyMode?: number;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  pin?: string;
}

export class GateCommandResultDto {
  @IsIn(['completed', 'failed'])
  status!: 'completed' | 'failed';

  @IsOptional()
  result?: Record<string, unknown>;
}

export class GateEventsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  controllerId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branchId?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  accepted?: string;
}
