import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtUser } from '../../common/types/jwt-user';
import { CreateEvaluationDto, ListEvaluationsDto } from './dto/evaluation.dto';
import { EvaluationsService } from './evaluations.service';
import { EvaluationWorkflowService, MonthlyEvaluationQuery } from './evaluation-workflow.service';

@UseGuards(JwtAuthGuard)
@Controller('hr/evaluations')
@RequiresPermission('affairs.evaluations:view')
export class EvaluationsController {
  constructor(private readonly evaluations: EvaluationsService, private readonly workflow: EvaluationWorkflowService) {}

  @Get()
  list(@Query() query: ListEvaluationsDto) {
    return this.evaluations.list(query);
  }

  @Get('criteria')
  getCriteria() {
    return this.evaluations.getCriteriaTree();
  }

  @Get('templates')
  listTemplates(
    @Query() query: { roleKey?: string; branchId?: number; active?: boolean },
    @CurrentUser() user: JwtUser,
  ) {
    return this.workflow.listTemplates(query, user);
  }

  @Get('monthly')
  listMonthly(@Query() query: MonthlyEvaluationQuery, @CurrentUser() user: JwtUser) {
    return this.workflow.listMonthly(query, user);
  }

  /** Modern role templates are versioned; historical monthly evaluations retain their question snapshot. */
  @Post('templates')
  @RequiresPermission('affairs.evaluations:create')
  versionTemplate(@Body() body: { roleKey: string; title: string; questions: Array<string | { title: string; maxScore?: number }>; branchId?: number }, @CurrentUser() user: JwtUser) {
    return this.workflow.versionTemplate(body, user);
  }

  @Post('monthly')
  @RequiresPermission('affairs.evaluations:create')
  createMonthly(@Body() body: { employeeId: number; templateId: number; templateVersion: number; monthKey: string; branchId?: number; answers?: Array<{ questionId: number; score?: number; answer?: string; note?: string }> }, @CurrentUser() user: JwtUser) {
    return this.workflow.createMonthly(body, user);
  }

  @Get(':id')
  getOne(@Param('id', ParseIntPipe) id: number) {
    return this.evaluations.getOne(id);
  }

  @Post()
  create(@Body() dto: CreateEvaluationDto, @CurrentUser() user: JwtUser) {
    return this.evaluations.create(dto, user.sub, user.name);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.evaluations.remove(id);
  }
}
