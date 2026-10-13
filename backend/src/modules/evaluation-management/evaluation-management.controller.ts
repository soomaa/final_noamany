import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtUser } from '../../common/types/jwt-user';
import { CreateCategoryDto, CreateEvaluationDto, CreateItemDto, ListEvaluationQueryDto, UpdateCategoryDto, UpdateEvaluationDto, UpdateItemDto } from './dto/evaluation-management.dto';
import { EvaluationManagementService } from './evaluation-management.service';

@UseGuards(JwtAuthGuard)
@Controller('evaluation-management')
export class EvaluationManagementController {
  constructor(private readonly service: EvaluationManagementService) {}
  @Get('lookups/job-titles') @RequiresPermission('evaluation-management.categories:view') jobTitles() { return this.service.jobTitles(); }
  @Get('lookups/branches') @RequiresPermission('evaluation-management.add_evaluation:view') branches() { return this.service.branches(); }
  @Get('categories') @RequiresPermission('evaluation-management.categories:view') listCategories() { return this.service.listCategories(); }
  @Post('categories') @RequiresPermission('evaluation-management.categories:create') createCategory(@Body() dto: CreateCategoryDto, @CurrentUser() user: JwtUser) { return this.service.createCategory(dto, user.sub); }
  @Patch('categories/:id') @RequiresPermission('evaluation-management.categories:update') updateCategory(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCategoryDto, @CurrentUser() user: JwtUser) { return this.service.updateCategory(id, dto, user.sub); }
  @Delete('categories/:id') @RequiresPermission('evaluation-management.categories:delete') removeCategory(@Param('id', ParseIntPipe) id: number) { return this.service.removeCategory(id); }
  @Get('items') @RequiresPermission('evaluation-management.items:view') listItems() { return this.service.listItems(); }
  @Post('items') @RequiresPermission('evaluation-management.items:create') createItem(@Body() dto: CreateItemDto, @CurrentUser() user: JwtUser) { return this.service.createItem(dto, user.sub); }
  @Patch('items/:id') @RequiresPermission('evaluation-management.items:update') updateItem(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateItemDto, @CurrentUser() user: JwtUser) { return this.service.updateItem(id, dto, user.sub); }
  @Delete('items/:id') @RequiresPermission('evaluation-management.items:delete') removeItem(@Param('id', ParseIntPipe) id: number) { return this.service.removeItem(id); }
  @Get('categories/:id/items') @RequiresPermission('evaluation-management.add_evaluation:view') categoryItems(@Param('id', ParseIntPipe) id: number) { return this.service.categoryItems(id); }
  @Get('categories/:id/employees') @RequiresPermission('evaluation-management.add_evaluation:view') employees(@Param('id', ParseIntPipe) id: number, @Query('branchId') branchId?: string) { return this.service.employees(id, branchId ? Number(branchId) : undefined); }
  @Get('evaluations') @RequiresPermission('evaluation-management.report:view') listEvaluations(@Query() query: ListEvaluationQueryDto) { return this.service.listEvaluations(query); }
  @Get('evaluations/:id') @RequiresPermission('evaluation-management.report:view') evaluation(@Param('id', ParseIntPipe) id: number) { return this.service.getEvaluation(id); }
  @Post('evaluations') @RequiresPermission('evaluation-management.add_evaluation:create') createEvaluation(@Body() dto: CreateEvaluationDto, @CurrentUser() user: JwtUser) { return this.service.createEvaluation(dto, user.sub); }
  @Patch('evaluations/:id') @RequiresPermission('evaluation-management.report:update') updateEvaluation(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateEvaluationDto, @CurrentUser() user: JwtUser) { return this.service.updateEvaluation(id, dto, user.sub); }
  @Delete('evaluations/:id') @RequiresPermission('evaluation-management.report:delete') removeEvaluation(@Param('id', ParseIntPipe) id: number) { return this.service.removeEvaluation(id); }
}
