import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtUser } from '../../common/types/jwt-user';
import { CustomerServiceService } from './customer-service.service';
import { CreateCustomerServiceFeedbackDto, CustomerServiceListDto, UpsertCustomerServiceQuestionDto } from './dto/customer-service.dto';

@UseGuards(JwtAuthGuard)
@Controller('customer-service')
export class CustomerServiceController {
  constructor(private readonly service: CustomerServiceService) {}
  @Get('questions') @RequiresPermission('customer-service.questions:view') listQuestions() { return this.service.listQuestions(); }
  @Post('questions') @RequiresPermission('customer-service.questions:create') createQuestion(@Body() dto: UpsertCustomerServiceQuestionDto) { return this.service.createQuestion(dto); }
  @Put('questions/:id') @RequiresPermission('customer-service.questions:update') updateQuestion(@Param('id', ParseIntPipe) id: number, @Body() dto: UpsertCustomerServiceQuestionDto) { return this.service.updateQuestion(id, dto); }
  @Delete('questions/:id') @RequiresPermission('customer-service.questions:delete') removeQuestion(@Param('id', ParseIntPipe) id: number) { return this.service.removeQuestion(id); }
  @Get('branches') @RequiresPermission('customer-service.feedback:view') branches() { return this.service.branches(); }
  @Get('subscriptions') @RequiresPermission('customer-service.feedback:view') subscriptions(@Query() query: CustomerServiceListDto) { return this.service.listSubscriptions(query); }
  @Get('reports') @RequiresPermission('customer-service.reports:view') reports(@Query() query: CustomerServiceListDto) { return this.service.listSubscriptions(query); }
  @Post('feedback') @RequiresPermission('customer-service.feedback:create') createFeedback(@Body() dto: CreateCustomerServiceFeedbackDto, @CurrentUser() user: JwtUser) { return this.service.createFeedback(dto, user); }
  @Get('feedback/:id') @RequiresPermission('customer-service.feedback:view') feedbackDetails(@Param('id', ParseIntPipe) id: number) { return this.service.feedbackDetails(id); }
}
