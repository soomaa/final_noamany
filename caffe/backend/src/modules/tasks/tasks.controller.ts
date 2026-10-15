import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtUser } from '../../common/types/jwt-user';
import {
  CreateTaskDto,
  ListTasksDto,
  TaskActionDto,
  UpdateTaskDto,
} from './dto/tasks.dto';
import { TasksService } from './tasks.service';

@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  list(@Query() query: ListTasksDto) {
    return this.tasks.list(query);
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.tasks.get(id);
  }

  @Post()
  create(@Body() dto: CreateTaskDto, @CurrentUser() user: JwtUser) {
    return this.tasks.create(dto, user);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTaskDto) {
    return this.tasks.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.tasks.remove(id);
  }

  @Post(':id/action')
  action(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TaskActionDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.tasks.action(id, dto, user.sub);
  }
}
