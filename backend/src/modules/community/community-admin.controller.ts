import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CommunityService } from './community.service';
import {
  ApproveCommunityPostDto,
  ListAdminCommunityPostsDto,
  RejectCommunityPostDto,
} from './dto/community.dto';

@UseGuards(JwtAuthGuard)
@Controller('app/community')
export class CommunityAdminController {
  constructor(private readonly community: CommunityService) {}

  @Get('posts')
  @RequiresPermission('app-management.community:view')
  listPosts(@Query() query: ListAdminCommunityPostsDto) {
    return this.community.listAdminPosts(query);
  }

  @Get('posts/:id')
  @RequiresPermission('app-management.community:view')
  getPost(@Param('id', ParseIntPipe) id: number) {
    return this.community.getAdminPost(id);
  }

  @Post('posts/:id/approve')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('app-management.community:update')
  approvePost(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('sub') adminId: number,
    @Body() dto: ApproveCommunityPostDto,
  ) {
    return this.community.approvePost(id, adminId, dto);
  }

  @Post('posts/:id/reject')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('app-management.community:update')
  rejectPost(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('sub') adminId: number,
    @Body() dto: RejectCommunityPostDto,
  ) {
    return this.community.rejectPost(id, adminId, dto);
  }
}
