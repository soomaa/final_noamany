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
import { ActivitiesService } from './activities.service';
import {
  AddActivityFileDto,
  CreateActivityDto,
  ListActivitiesDto,
  RejectActivityDto,
  UpdateActivityDto,
} from './dto/activities.dto';

@UseGuards(JwtAuthGuard)
@Controller('activities')
export class ActivitiesController {
  constructor(private readonly activities: ActivitiesService) {}

  @Get()
  list(@Query() query: ListActivitiesDto) {
    return this.activities.list(query);
  }

  // Static segment route declared before the ':id' family.
  @Delete('files/:fileId')
  removeFile(@Param('fileId', ParseIntPipe) fileId: number) {
    return this.activities.removeFile(fileId);
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.activities.get(id);
  }

  @Get(':id/files')
  listFiles(@Param('id', ParseIntPipe) id: number) {
    return this.activities.listFiles(id);
  }

  @Post()
  create(@Body() dto: CreateActivityDto, @CurrentUser() user: JwtUser) {
    return this.activities.create(dto, user);
  }

  @Post(':id/approve')
  approve(@Param('id', ParseIntPipe) id: number) {
    return this.activities.approve(id);
  }

  @Post(':id/reject')
  reject(@Param('id', ParseIntPipe) id: number, @Body() dto: RejectActivityDto) {
    return this.activities.reject(id, dto);
  }

  @Post(':id/files')
  addFile(@Param('id', ParseIntPipe) id: number, @Body() dto: AddActivityFileDto) {
    return this.activities.addFile(id, dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateActivityDto) {
    return this.activities.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.activities.remove(id);
  }
}
