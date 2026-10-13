import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
} from '@nestjs/common';
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ClubBranchGroupService } from '../../common/branch-groups/club-branch-group.service';

class CreateGroupDto {
  @IsString()
  name: string;

  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Type(() => Number)
  branchIds: number[];
}

class UpdateGroupDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Type(() => Number)
  branchIds?: number[];
}

@Controller('club-branch-groups')
export class ClubBranchGroupsAdminController {
  constructor(private readonly groups: ClubBranchGroupService) {}

  @Get()
  list() {
    return this.groups.listGroups();
  }

  @Post()
  create(@Body() dto: CreateGroupDto) {
    return this.groups.createGroup(dto.name, dto.branchIds);
  }

  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateGroupDto) {
    return this.groups.updateGroup(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.groups.deleteGroup(id);
  }
}
