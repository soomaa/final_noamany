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
import { ClubTrainersService } from './club-trainers.service';
import { ListClubTrainerSalariesDto } from './dto/list-club-trainers.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtUser } from '../../common/types/jwt-user';

@UseGuards(JwtAuthGuard)
@Controller('club-trainer-salaries')
@RequiresPermission('club.fitness:view', 'club.subscriptions.special:view', 'club.fitness.trainer_settings:view', 'club.fitness.trainer_payments:view')
export class ClubTrainerSalariesController {
  constructor(private readonly service: ClubTrainersService) {}

  @Get()
  list(@Query() query: ListClubTrainerSalariesDto, @CurrentUser() user: JwtUser) {
    return this.service.listSalaries(query, user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.findSalary(id, user);
  }

  @Post()
  @RequiresPermission('club.fitness:create', 'club.subscriptions.special:create', 'club.fitness.trainer_settings:update')
  create(@Body() body: Record<string, unknown>, @CurrentUser() user: JwtUser) {
    return this.service.createSalary(body, user);
  }

  @Put(':id')
  @RequiresPermission('club.fitness:update', 'club.subscriptions.special:update', 'club.fitness.trainer_settings:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>, @CurrentUser() user: JwtUser) {
    return this.service.updateSalary(id, body, user);
  }

  @Delete(':id')
  @RequiresPermission('club.fitness:delete', 'club.fitness.trainer_settings:update')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.removeSalary(id, user);
  }
}
