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
import { ScopedHrData } from '../../common/hr-scope/scoped-hr-data.decorator';
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
  @ScopedHrData()
  list(@Query() query: ListActivitiesDto, @CurrentUser() user: JwtUser) {
    return this.activities.list(query, user);
  }

  // Static segment route declared before the ':id' family.
  @Delete('files/:fileId')
  @ScopedHrData()
  @RequiresPermission('affairs.activities:delete')
  removeFile(@Param('fileId', ParseIntPipe) fileId: number, @CurrentUser() user: JwtUser) {
    return this.activities.removeFile(fileId, user);
  }

  @Get(':id')
  @ScopedHrData()
  get(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.activities.get(id, user);
  }

  @Get(':id/files')
  @ScopedHrData()
  listFiles(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.activities.listFiles(id, user);
  }

  @Post()
  @ScopedHrData()
  @RequiresPermission('affairs.activities:create')
  create(@Body() dto: CreateActivityDto, @CurrentUser() user: JwtUser) {
    return this.activities.create(dto, user);
  }

  @Post(':id/approve')
  @ScopedHrData()
  @RequiresPermission('affairs.activities:approve')
  approve(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.activities.approve(id, user);
  }

  @Post(':id/reject')
  @ScopedHrData()
  @RequiresPermission('affairs.activities:reject')
  reject(@Param('id', ParseIntPipe) id: number, @Body() dto: RejectActivityDto, @CurrentUser() user: JwtUser) {
    return this.activities.reject(id, dto, user);
  }

  @Post(':id/files')
  @ScopedHrData()
  @RequiresPermission('affairs.activities:update')
  addFile(@Param('id', ParseIntPipe) id: number, @Body() dto: AddActivityFileDto, @CurrentUser() user: JwtUser) {
    return this.activities.addFile(id, dto, user);
  }

  @Patch(':id')
  @ScopedHrData()
  @RequiresPermission('affairs.activities:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateActivityDto, @CurrentUser() user: JwtUser) {
    return this.activities.update(id, dto, user);
  }

  @Delete(':id')
  @ScopedHrData()
  @RequiresPermission('affairs.activities:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.activities.remove(id, user);
  }
}
