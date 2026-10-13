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
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
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
@RequiresPermission('affairs.activities:view')
export class ActivitiesController {
  constructor(private readonly activities: ActivitiesService) {}

  @Get()
  list(@Query() query: ListActivitiesDto) {
    return this.activities.list(query);
  }

  // Static segment route declared before the ':id' family.
  @Delete('files/:fileId')
  @RequiresPermission('affairs.activities:delete')
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
  @RequiresPermission('affairs.activities:create')
  create(@Body() dto: CreateActivityDto, @CurrentUser() user: JwtUser) {
    return this.activities.create(dto, user);
  }

  @Post(':id/approve')
  @RequiresPermission('affairs.activities:update')
  approve(@Param('id', ParseIntPipe) id: number) {
    return this.activities.approve(id);
  }

  @Post(':id/reject')
  @RequiresPermission('affairs.activities:update')
  reject(@Param('id', ParseIntPipe) id: number, @Body() dto: RejectActivityDto) {
    return this.activities.reject(id, dto);
  }

  @Post(':id/files')
  @RequiresPermission('affairs.activities:update')
  addFile(@Param('id', ParseIntPipe) id: number, @Body() dto: AddActivityFileDto) {
    return this.activities.addFile(id, dto);
  }

  @Patch(':id')
  @RequiresPermission('affairs.activities:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateActivityDto) {
    return this.activities.update(id, dto);
  }

  @Delete(':id')
  @RequiresPermission('affairs.activities:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.activities.remove(id);
  }
}
