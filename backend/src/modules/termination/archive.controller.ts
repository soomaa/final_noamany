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
  list(@Query() query: ListArchiveDto) {
    return this.archive.list(query);
  }

  @Get(':id')
  getOne(@Param('id', ParseIntPipe) id: number) {
    return this.archive.getOne(id);
  }

  @Post()
  create(@Body() dto: CreateArchiveDto, @CurrentUser() user: JwtUser) {
    return this.archive.create(dto, user.sub);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateArchiveDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.archive.update(id, dto, user.sub);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.archive.remove(id);
  }
}
