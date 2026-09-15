import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtUser } from '../../common/types/jwt-user';
import { CustomerRosterQuery, CustomerServiceService, FollowUpQuery } from './customer-service.service';

@UseGuards(JwtAuthGuard)
@Controller('club/customer-service')
@RequiresPermission('club.customer_service:view')
export class CustomerServiceController {
  constructor(private readonly service: CustomerServiceService) {}
  @Get('customers') customers(@Query() query: CustomerRosterQuery, @CurrentUser() user: JwtUser) { return this.service.listCustomers(query, user); }
  @Get('follow-ups') list(@Query() query: FollowUpQuery, @CurrentUser() user: JwtUser) { return this.service.listFollowUps(query, user); }
  @Get('follow-ups/:id') detail(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) { return this.service.getInteraction(id, user); }
  @Get('opinions') opinions(@Query() query: FollowUpQuery, @CurrentUser() user: JwtUser) { return this.service.listOpinions(query, user); }
  @Get('questions') questions(@Query() query: { branchId?: number; includeInactive?: boolean }, @CurrentUser() user: JwtUser) { return this.service.listQuestions(query, user); }
  @Post('follow-ups') @RequiresPermission('club.customer_service:create')
  create(@Body() body: Parameters<CustomerServiceService['createInteraction']>[0], @CurrentUser() user: JwtUser) { return this.service.createInteraction(body, user.sub, user); }
  @Post('questions') @RequiresPermission('club.customer_service:update')
  question(@Body() body: { title: string; branchId?: number }, @CurrentUser() user: JwtUser) { return this.service.createQuestion(body, user.sub, user); }
  @Patch('questions/:id') @RequiresPermission('club.customer_service:update')
  versionQuestion(@Param('id', ParseIntPipe) id: number, @Body('title') title: string, @CurrentUser() user: JwtUser) { return this.service.versionQuestion(id, title, user.sub, user); }
}
