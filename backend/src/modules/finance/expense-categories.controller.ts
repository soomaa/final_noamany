import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { UpsertExpenseCategoryDto } from './dto/finance.dto';
import { ExpenseCategoriesService } from './expense-categories.service';

@UseGuards(JwtAuthGuard)
@Controller('expense-categories')
@RequiresPermission(
  'financial-reports.expenses:view',
  'club.subscriptions.treasury:view',
)
export class ExpenseCategoriesController {
  constructor(private readonly service: ExpenseCategoriesService) {}

  @Get()
  list(@Query('activeOnly') activeOnly?: string) {
    return this.service.list(activeOnly === 'true' || activeOnly === '1');
  }

  @Post()
  @RequiresPermission('financial-reports.expenses:create')
  create(@Body() body: UpsertExpenseCategoryDto) {
    return this.service.create(body);
  }

  @Put(':id')
  @RequiresPermission('financial-reports.expenses:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: UpsertExpenseCategoryDto) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @RequiresPermission('financial-reports.expenses:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
