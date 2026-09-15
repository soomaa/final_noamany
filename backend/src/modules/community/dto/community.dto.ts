import { CommunityPostCategory, CommunityPostStatus, CommunityReactionType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class CreateCommunityPostDto {
  @IsEnum(CommunityPostCategory) category!: CommunityPostCategory;
  @IsString() @MaxLength(255) title!: string;
  @IsString() @MaxLength(10000) description!: string;
}

export class SetCommunityReactionDto {
  @IsEnum(CommunityReactionType) reactionType!: CommunityReactionType;
}

export class ApproveCommunityPostDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(1) @MaxLength(10000) adminReply!: string;
}

export class RejectCommunityPostDto {
  @IsOptional() @IsString() @MaxLength(10000) rejectionReason?: string;
}

class ListCommunityPostsDto extends PaginationDto {
  @IsOptional() @IsEnum(CommunityPostCategory) category?: CommunityPostCategory;
  @IsOptional() @IsEnum(CommunityPostStatus) status?: CommunityPostStatus;
  @IsOptional() @IsString() @MaxLength(255) declare search?: string;
}

export class ListMemberCommunityPostsDto extends ListCommunityPostsDto {
  pageSize: number = 20;
}

export class ListAdminCommunityPostsDto extends ListCommunityPostsDto {}
