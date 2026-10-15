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
import { ClubEventCategoriesService } from './club-event-categories.service';
import { UpsertClubEventCategoryDto } from './dto/upsert-club-event-category.dto';

@UseGuards(JwtAuthGuard)
@Controller('club-events/categories')
@RequiresPermission('club.events.settings:view')
export class ClubEventCategoriesController {
  constructor(private readonly service: ClubEventCategoriesService) {}

  @Get()
  list(@Query('activeOnly') activeOnly?: string) {
    return this.service.list(activeOnly === 'true' || activeOnly === '1');
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequiresPermission('club.events.settings:configure')
  create(@Body() body: UpsertClubEventCategoryDto) {
    return this.service.create(body);
  }

  @Put(':id')
  @RequiresPermission('club.events.settings:configure')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Partial<UpsertClubEventCategoryDto>) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @RequiresPermission('club.events.settings:configure')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
