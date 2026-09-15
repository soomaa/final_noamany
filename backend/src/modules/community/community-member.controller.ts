import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentMember } from '../../common/decorators/current-member.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { MemberJwtUser } from '../../common/types/member-jwt-user';
import { MemberJwtAuthGuard } from '../member/guards/member-jwt-auth.guard';
import { CommunityService } from './community.service';
import {
  CreateCommunityPostDto,
  ListMemberCommunityPostsDto,
  SetCommunityReactionDto,
} from './dto/community.dto';

@Public()
@UseGuards(MemberJwtAuthGuard)
@Controller('member/community')
export class CommunityMemberController {
  constructor(private readonly community: CommunityService) {}

  /** Fixed categories used by the member app when composing or filtering community posts. */
  @Get('categories')
  categories() {
    return {
      data: [
        { value: 'question', label: 'سؤال' },
        { value: 'experience', label: 'تجربة' },
        { value: 'discussion', label: 'نقاش' },
      ],
    };
  }

  @Post('posts')
  createPost(
    @CurrentMember() member: MemberJwtUser,
    @Body() dto: CreateCommunityPostDto,
  ) {
    return this.community.createPost(member, dto);
  }

  @Get('posts')
  listPosts(
    @CurrentMember() member: MemberJwtUser,
    @Query() query: ListMemberCommunityPostsDto,
  ) {
    return this.community.listMemberPosts(member, query);
  }

  @Get('posts/:id')
  getPost(
    @CurrentMember() member: MemberJwtUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.community.getMemberPost(member, id);
  }

  @Post('posts/:id/reaction')
  @HttpCode(HttpStatus.OK)
  setReaction(
    @CurrentMember() member: MemberJwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetCommunityReactionDto,
  ) {
    return this.community.setReaction(member, id, dto);
  }
}
