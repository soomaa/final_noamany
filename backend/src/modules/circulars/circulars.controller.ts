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
import { CircularsService } from './circulars.service';
import { CreateCircularDto, ListCircularsDto, UpdateCircularDto } from './dto/circular.dto';

@UseGuards(JwtAuthGuard)
@Controller('hr/circulars')
@RequiresPermission('affairs.circulars:view')
export class CircularsController {
  constructor(private readonly circulars: CircularsService) {}

  @Get()
  list(@Query() query: ListCircularsDto) {
    return this.circulars.list(query);
  }

  @Get('recipients/departments')
  listDepartmentRecipients() {
    return this.circulars.listDepartmentRecipients();
  }

  @Get(':id')
  getOne(@Param('id', ParseIntPipe) id: number) {
    return this.circulars.getOne(id);
  }

  @Post()
  @RequiresPermission('affairs.circulars:create')
  create(@Body() dto: CreateCircularDto, @CurrentUser() user: JwtUser) {
    return this.circulars.create(dto, user.sub, user.name);
  }

  @Patch(':id')
  @RequiresPermission('affairs.circulars:update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCircularDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.circulars.update(id, dto, user.sub, user.name);
  }

  @Patch(':id/seen')
  markSeen(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.circulars.markSeen(id, user.emp_code);
  }

  @Delete(':id')
  @RequiresPermission('affairs.circulars:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.circulars.remove(id);
  }
}
