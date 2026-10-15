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
import { ScopedHrData } from '../../common/hr-scope/scoped-hr-data.decorator';

@UseGuards(JwtAuthGuard)
@Controller('hr/evaluations')
@RequiresPermission('affairs.evaluations:view')
export class EvaluationsController {
  constructor(private readonly evaluations: EvaluationsService) {}

  @Get()
  @ScopedHrData()
  list(@Query() query: ListEvaluationsDto, @CurrentUser() user: JwtUser) {
    return this.evaluations.list(query, user);
  }

  @Get('criteria')
  getCriteria() {
    return this.evaluations.getCriteriaTree();
  }

  @Get(':id')
  @ScopedHrData()
  getOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.evaluations.getOne(id, user);
  }

  @Post()
  @ScopedHrData()
  @RequiresPermission('affairs.evaluations:create')
  create(@Body() dto: CreateEvaluationDto, @CurrentUser() user: JwtUser) {
    return this.evaluations.create(dto, user, user.sub, user.name);
  }

  @Delete(':id')
  @ScopedHrData()
  @RequiresPermission('affairs.evaluations:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.evaluations.remove(id, user);
  }
}
