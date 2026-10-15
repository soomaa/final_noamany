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
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AppUsersService } from './app-users.service';
import {
  CreateAppUserDto,
  ListAppUsersDto,
  UpdateAppUserDto,
  UpdateAppUserStatusDto,
} from './dto/app-users.dto';

@UseGuards(JwtAuthGuard)
@Controller('app-users')
export class AppUsersController {
  constructor(private readonly appUsers: AppUsersService) {}

  @Get()
  list(@Query() query: ListAppUsersDto) {
    return this.appUsers.list(query);
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.appUsers.get(id);
  }

  @Post()
  @RequiresPermission('app-management:create')
  create(@Body() dto: CreateAppUserDto) {
    return this.appUsers.create(dto);
  }

  @Patch(':id/status')
  @RequiresPermission('app-management:update')
  setStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAppUserStatusDto,
  ) {
    return this.appUsers.setStatus(id, dto.status);
  }

  @Patch(':id')
  @RequiresPermission('app-management:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAppUserDto) {
    return this.appUsers.update(id, dto);
  }

  @Delete(':id')
  @RequiresPermission('app-management:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.appUsers.remove(id);
  }
}
