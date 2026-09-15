import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { TrainerPerformanceService } from './trainer-performance.service';

@UseGuards(JwtAuthGuard)
@Controller('club-trainer-performance')
export class TrainerPerformanceController {
  constructor(private readonly service: TrainerPerformanceService) {}
  @Get('trainers') @RequiresPermission('club.fitness.trainers:view') trainers() { return this.service.listTrainers(); }
  @Get('criteria') @RequiresPermission('club.fitness.trainer_evaluation_criteria:view') criteria() { return this.service.listCriteria(); }
  @Post('criteria') @RequiresPermission('club.fitness.trainer_evaluation_criteria:update') criterion(@Body() body: any, @CurrentUser('sub') userId: number) { return this.service.saveCriterion(body, userId); }
  @Post('targets') @RequiresPermission('club.fitness.trainer_targets:update') target(@Body() body: any, @CurrentUser('sub') userId: number) { return this.service.saveTarget(body, userId); }
  @Post('evaluations') @RequiresPermission('club.fitness.trainer_evaluations:update') evaluation(@Body() body: any, @CurrentUser() user: any) { return this.service.saveEvaluation(body, user); }
  @Get('trainers/:id/profile') @RequiresPermission('club.fitness.trainer_search:view') profile(@Param('id', ParseIntPipe) id: number, @Query('month') month: string) { return this.service.profile(id, month); }
  @Get('analytics/branches') @RequiresPermission('club.fitness.branch_analysis:view') branchAnalysis(@CurrentUser() user: any, @Query('month') month: string, @Query('branchId') branchId?: string) { return this.service.branchAnalysis(user, month, branchId); }
  @Get('analytics/reception') @RequiresPermission('club.fitness.reception_analysis:view') receptionAnalysis(@CurrentUser() user: any, @Query('month') month: string, @Query('branchId') branchId?: string) { return this.service.receptionAnalysis(user, month, branchId); }
  @Get('analytics/shifts') @RequiresPermission('club.fitness.shift_analysis:view') shiftAnalysis(@CurrentUser() user: any, @Query('month') month: string, @Query('branchId') branchId?: string) { return this.service.shiftAnalysis(user, month, branchId); }
}
