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
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtUser } from '../../common/types/jwt-user';
import { ArchiveService } from './archive.service';
import { CreateArchiveDto, ListArchiveDto, UpdateArchiveDto } from './dto/archive.dto';

@UseGuards(JwtAuthGuard)
@Controller('termination/archive')
@RequiresPermission('termination.archive:view')
export class ArchiveController {
  constructor(private readonly archive: ArchiveService) {}

  @Get()
  list(@Query() query: ListArchiveDto, @CurrentUser() user: JwtUser) {
    return this.archive.list(query, user);
  }

  @Get(':id')
  getOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.archive.getOne(id, user);
  }

  // termination.archive exposes only view/update/export/print/audit in the RBAC catalog,
  // so every archive mutation requires :update.
  @Post()
  @RequiresPermission('termination.archive:update')
  create(@Body() dto: CreateArchiveDto, @CurrentUser() user: JwtUser) {
    return this.archive.create(dto, user);
  }

  @Patch(':id')
  @RequiresPermission('termination.archive:update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateArchiveDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.archive.update(id, dto, user);
  }

  @Delete(':id')
  @RequiresPermission('termination.archive:update')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.archive.remove(id, user);
  }
}
