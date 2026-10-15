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
import { ClubWorkoutsService } from './club-workouts.service';
import { ListClubFitnessDto } from './dto/list-club-fitness.dto';

@UseGuards(JwtAuthGuard)
@Controller('club-exercises')
@RequiresPermission('club.fitness:view')
export class ClubExercisesController {
  constructor(private readonly service: ClubWorkoutsService) {}

  @Get()
  list(@Query() query: ListClubFitnessDto) {
    return this.service.listExercises(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findExercise(id);
  }

  @Post()
  @RequiresPermission('club.fitness:create')
  create(@Body() body: Record<string, unknown>) {
    return this.service.createExercise(body);
  }

  @Put(':id')
  @RequiresPermission('club.fitness:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>) {
    return this.service.updateExercise(id, body);
  }

  @Delete(':id')
  @RequiresPermission('club.fitness:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.removeExercise(id);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('club-workout-programs')
@RequiresPermission('club.fitness:view')
export class ClubWorkoutProgramsController {
  constructor(private readonly service: ClubWorkoutsService) {}

  @Get()
  list(@Query() query: ListClubFitnessDto) {
    return this.service.listPrograms(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findProgram(id);
  }

  @Post()
  @RequiresPermission('club.fitness:create')
  create(@Body() body: Record<string, unknown>) {
    return this.service.createProgram(body);
  }

  @Put(':id')
  @RequiresPermission('club.fitness:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>) {
    return this.service.updateProgram(id, body);
  }

  @Delete(':id')
  @RequiresPermission('club.fitness:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.removeProgram(id);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('club-workout-templates')
@RequiresPermission('club.fitness:view')
export class ClubWorkoutTemplatesController {
  constructor(private readonly service: ClubWorkoutsService) {}

  @Get()
  list(@Query() query: ListClubFitnessDto) {
    return this.service.listTemplates(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findTemplate(id);
  }

  @Post()
  @RequiresPermission('club.fitness:create')
  create(@Body() body: Record<string, unknown>) {
    return this.service.createTemplate(body);
  }

  @Put(':id')
  @RequiresPermission('club.fitness:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>) {
    return this.service.updateTemplate(id, body);
  }

  @Delete(':id')
  @RequiresPermission('club.fitness:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.removeTemplate(id);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('club-member-progress')
@RequiresPermission('club.fitness:view')
export class ClubMemberProgressController {
  constructor(private readonly service: ClubWorkoutsService) {}

  @Get()
  list(@Query() query: ListClubFitnessDto) {
    return this.service.listProgress(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findProgress(id);
  }

  @Post()
  @RequiresPermission('club.fitness:create')
  create(@Body() body: Record<string, unknown>) {
    return this.service.createProgress(body);
  }

  @Put(':id')
  @RequiresPermission('club.fitness:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>) {
    return this.service.updateProgress(id, body);
  }

  @Delete(':id')
  @RequiresPermission('club.fitness:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.removeProgress(id);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('club-physical-assessments')
@RequiresPermission('club.fitness:view')
export class ClubPhysicalAssessmentsController {
  constructor(private readonly service: ClubWorkoutsService) {}

  @Get()
  list(@Query() query: ListClubFitnessDto) {
    return this.service.listAssessments(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findAssessment(id);
  }

  @Post()
  @RequiresPermission('club.fitness:create')
  create(@Body() body: Record<string, unknown>) {
    return this.service.createAssessment(body);
  }

  @Put(':id')
  @RequiresPermission('club.fitness:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>) {
    return this.service.updateAssessment(id, body);
  }

  @Delete(':id')
  @RequiresPermission('club.fitness:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.removeAssessment(id);
  }
}
