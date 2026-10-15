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

@UseGuards(JwtAuthGuard)
@Controller('hr/evaluations')
@RequiresPermission('affairs.evaluations:view')
export class EvaluationsController {
  constructor(private readonly evaluations: EvaluationsService) {}

  @Get()
  list(@Query() query: ListEvaluationsDto) {
    return this.evaluations.list(query);
  }

  @Get('criteria')
  getCriteria() {
    return this.evaluations.getCriteriaTree();
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
