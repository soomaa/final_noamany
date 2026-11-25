import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ListQueryDto } from '../../../common/dto/list-query.dto';

export class MemberGroupPlanDto {
  @IsInt() @Min(1) subscriptionTypeId!: number;
  @IsIn(['percentage', 'fixed']) discountType!: 'percentage' | 'fixed';
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(99999999.99) discountValue!: number;
}

export class UpsertMemberGroupDto {
  @IsString() @MaxLength(200) name!: string;
  @IsOptional() @IsString() @MaxLength(100) category?: string;
  @IsOptional() @IsInt() @Min(0) maxMembers?: number;
  @IsOptional() @IsInt() @Min(1) branchId?: number;
  @IsOptional() @IsIn(['none', 'percentage', 'fixed']) discountType?: string;
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99999999.99)
  discountAmount?: number;
  /** Packages this group discounts. Omit to keep the current list; [] = group-wide rule on every package. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => MemberGroupPlanDto)
  plans?: MemberGroupPlanDto[];
}

export class AssignGroupMembersDto {
  @IsOptional() @IsInt() @Min(1) memberId?: number;
  /** Optional employee number at the group's organisation; only with a single memberId. */
  @IsOptional() @IsString() @MaxLength(50) employeeNumber?: string | null;
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsInt({ each: true })
  @Min(1, { each: true })
  memberIds?: number[];
}

export class MemberGroupQueryDto extends ListQueryDto {
  @IsOptional() @IsIn(['true', 'false']) includeInactive?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) groupId?: number;
}
