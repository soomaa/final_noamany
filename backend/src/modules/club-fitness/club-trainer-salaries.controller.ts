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

@UseGuards(JwtAuthGuard)
@Controller('club-trainer-salaries')
@RequiresPermission('club.fitness.trainer_payments:view')
export class ClubTrainerSalariesController {
  constructor(private readonly service: ClubTrainersService) {}

  @Get()
  list(@Query() query: ListClubTrainerSalariesDto) {
    return this.service.listSalaries(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findSalary(id);
  }

  @Post()
  @RequiresPermission('club.fitness.trainer_payments:create')
  create(@Body() body: Record<string, unknown>) {
    return this.service.createSalary(body);
  }

  @Put(':id')
  @RequiresPermission('club.fitness.trainer_payments:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>) {
    return this.service.updateSalary(id, body);
  }

  @Delete(':id')
  @RequiresPermission('club.fitness.trainer_payments:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.removeSalary(id);
  }
}
