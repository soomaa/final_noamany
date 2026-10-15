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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtUser } from '../../common/types/jwt-user';

@UseGuards(JwtAuthGuard)
@Controller('club-exercises')
@RequiresPermission('club.fitness.strength:view')
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
  @RequiresPermission('club.fitness.strength:create')
  create(@Body() body: Record<string, unknown>) {
    return this.service.createExercise(body);
  }

  @Put(':id')
  @RequiresPermission('club.fitness.strength:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>) {
    return this.service.updateExercise(id, body);
  }

  @Delete(':id')
  @RequiresPermission('club.fitness.strength:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.removeExercise(id);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('club-workout-programs')
@RequiresPermission('club.fitness.programs:view')
export class ClubWorkoutProgramsController {
  constructor(private readonly service: ClubWorkoutsService) {}

  @Get()
  list(@Query() query: ListClubFitnessDto, @CurrentUser() user: JwtUser) {
    return this.service.listPrograms(query, user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.findProgram(id, user);
  }

  @Post()
  @RequiresPermission('club.fitness.programs:create')
  create(@Body() body: Record<string, unknown>, @CurrentUser() user: JwtUser) {
    return this.service.createProgram(body, user);
  }

  @Put(':id')
  @RequiresPermission('club.fitness.programs:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>, @CurrentUser() user: JwtUser) {
    return this.service.updateProgram(id, body, user);
  }

  @Delete(':id')
  @RequiresPermission('club.fitness.programs:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.removeProgram(id, user);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('club-workout-templates')
@RequiresPermission('club.fitness.templates:view')
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
  @RequiresPermission('club.fitness.templates:create')
  create(@Body() body: Record<string, unknown>) {
    return this.service.createTemplate(body);
  }

  @Put(':id')
  @RequiresPermission('club.fitness.templates:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>) {
    return this.service.updateTemplate(id, body);
  }

  @Delete(':id')
  @RequiresPermission('club.fitness.templates:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.removeTemplate(id);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('club-member-progress')
@RequiresPermission('club.fitness.progress:view')
export class ClubMemberProgressController {
  constructor(private readonly service: ClubWorkoutsService) {}

  @Get()
  list(@Query() query: ListClubFitnessDto, @CurrentUser() user: JwtUser) {
    return this.service.listProgress(query, user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.findProgress(id, user);
  }

  @Post()
  @RequiresPermission('club.fitness.progress:create')
  create(@Body() body: Record<string, unknown>, @CurrentUser() user: JwtUser) {
    return this.service.createProgress(body, user);
  }

  @Put(':id')
  @RequiresPermission('club.fitness.progress:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>, @CurrentUser() user: JwtUser) {
    return this.service.updateProgress(id, body, user);
  }

  @Delete(':id')
  @RequiresPermission('club.fitness.progress:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.removeProgress(id, user);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('club-physical-assessments')
@RequiresPermission('club.fitness.assessments:view')
export class ClubPhysicalAssessmentsController {
  constructor(private readonly service: ClubWorkoutsService) {}

  @Get()
  list(@Query() query: ListClubFitnessDto, @CurrentUser() user: JwtUser) {
    return this.service.listAssessments(query, user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.findAssessment(id, user);
  }

  @Post()
  @RequiresPermission('club.fitness.assessments:create')
  create(@Body() body: Record<string, unknown>, @CurrentUser() user: JwtUser) {
    return this.service.createAssessment(body, user);
  }

  @Put(':id')
  @RequiresPermission('club.fitness.assessments:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>, @CurrentUser() user: JwtUser) {
    return this.service.updateAssessment(id, body, user);
  }

  @Delete(':id')
  @RequiresPermission('club.fitness.assessments:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.removeAssessment(id, user);
  }
}
