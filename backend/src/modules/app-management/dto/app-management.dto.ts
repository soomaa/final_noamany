import { AmExerciseDifficulty, AmInvitationStatus, AmNewsType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ListAppItemsDto extends PaginationDto {
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isPublished?: boolean;

  @IsOptional()
  @Transform(({ value }) => (value != null && value !== '' ? parseInt(value, 10) : undefined))
  @IsInt()
  categoryId?: number;
}

export class ListInvitationsDto extends PaginationDto {
  @IsOptional()
  @IsEnum(AmInvitationStatus)
  status?: AmInvitationStatus;

  @IsOptional()
  @Transform(({ value }) => (value != null && value !== '' ? parseInt(value, 10) : undefined))
  @IsInt()
  branchId?: number;
}

export class UpdateAboutAppDto {
  @IsOptional() @IsString() @MaxLength(255) appName?: string;
  @IsOptional() @IsString() @MaxLength(50) appVersion?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() features?: string;
  @IsOptional() @IsString() @MaxLength(255) contactEmail?: string;
  @IsOptional() @IsString() @MaxLength(50) contactPhone?: string;
  @IsOptional() @IsString() @MaxLength(255) website?: string;
  @IsOptional() @IsString() privacyPolicy?: string;
  @IsOptional() @IsString() termsOfService?: string;
}

export class CreateInvitationDto {
  @IsOptional() @IsString() invitationCode?: string;
  @IsString() recipientName!: string;
  @IsOptional() @IsEmail() recipientEmail?: string;
  @IsOptional() @IsString() recipientPhone?: string;
  @IsOptional() @IsEnum(AmInvitationStatus) status?: AmInvitationStatus;
  @IsOptional() @Transform(({ value }) => (value != null && value !== '' ? parseInt(value, 10) : undefined))
  @IsInt()
  branchId?: number;
  @IsOptional() @Transform(({ value }) => (value != null && value !== '' ? parseInt(value, 10) : undefined))
  @IsInt()
  inviterMemberId?: number;
}

export class UpdateInvitationDto {
  @IsOptional() @IsString() recipientName?: string;
  @IsOptional() @IsEmail() recipientEmail?: string;
  @IsOptional() @IsString() recipientPhone?: string;
  @IsOptional() @IsEnum(AmInvitationStatus) status?: AmInvitationStatus;
  @IsOptional() @IsString() rejectionReason?: string;
  @IsOptional() @Transform(({ value }) => (value != null && value !== '' ? parseInt(value, 10) : undefined))
  @IsInt()
  branchId?: number;
}

export class UpsertOfferDto {
  @IsString() title!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) discount?: number;
  @IsOptional() @IsString() startDate?: string;
  @IsOptional() @IsString() endDate?: string;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isActive?: boolean;
}

export class UpsertTrainerDto {
  @IsString() name!: string;
  @IsOptional() @Transform(({ value }) => (value != null && value !== '' ? parseInt(value, 10) : undefined))
  @IsInt()
  employeeId?: number;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() specialization?: string;
  @IsOptional() @Transform(({ value }) => (value != null && value !== '' ? parseInt(value, 10) : undefined))
  @IsInt()
  experience?: number;
  @IsOptional() @IsString() bio?: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isActive?: boolean;
}

export class UpsertExerciseCategoryDto {
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isActive?: boolean;
}

export class UpsertExerciseDto {
  @IsString() name!: string;
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  categoryId!: number;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() instructions?: string;
  @IsOptional() @Transform(({ value }) => (value != null && value !== '' ? parseInt(value, 10) : undefined))
  @IsInt()
  duration?: number;
  @IsOptional() @IsEnum(AmExerciseDifficulty) difficulty?: AmExerciseDifficulty;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isActive?: boolean;
}

export class UpsertNewsDto {
  @IsString() title!: string;
  @IsString() content!: string;
  @IsEnum(AmNewsType) newsType!: AmNewsType;
  @IsOptional() @IsString() publishDate?: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isPublished?: boolean;
}

export class UpsertAdDto {
  @IsString() title!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsString() linkUrl?: string;
  @IsOptional() @IsString() startDate?: string;
  @IsOptional() @IsString() endDate?: string;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isActive?: boolean;
}

export class InvitationStatusParamDto {
  @IsIn(['pending', 'accepted', 'rejected', 'attended'])
  status!: AmInvitationStatus;
}

export class ListMemberNotificationsDto extends PaginationDto {
  @IsOptional() @Transform(({ value }) => (value != null && value !== '' ? parseInt(value, 10) : undefined))
  @IsInt()
  memberId?: number;

  @IsOptional() @Transform(({ value }) => (value != null && value !== '' ? parseInt(value, 10) : undefined))
  @IsInt()
  branchId?: number;

  @IsOptional() @IsString() @MaxLength(40) type?: string;
}

/**
 * Admin/system push into a member's notification feed. Target EITHER one member (`memberId`)
 * OR broadcast to all active members (`broadcast: true`, optionally scoped to `branchId`).
 */
export class CreateMemberNotificationDto {
  @IsString() @MaxLength(200) title!: string;
  @IsString() body!: string;
  @IsOptional() @IsString() @MaxLength(40) type?: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsString() data?: string;

  @IsOptional() @Transform(({ value }) => (value != null && value !== '' ? parseInt(value, 10) : undefined))
  @IsInt()
  memberId?: number;

  @IsOptional() @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  broadcast?: boolean;

  @IsOptional() @Transform(({ value }) => (value != null && value !== '' ? parseInt(value, 10) : undefined))
  @IsInt()
  branchId?: number;
}
