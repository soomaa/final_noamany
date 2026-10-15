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
import { ListPenaltiesDto } from './dto/list-penalties.dto';
import { CreateBylawDto, CreatePenaltyDto, UpdateBylawDto, UpdatePenaltyDto } from './dto/penalty.dto';
import { PenaltiesService } from './penalties.service';
import { ScopedHrData } from '../../common/hr-scope/scoped-hr-data.decorator';

@UseGuards(JwtAuthGuard)
@Controller('penalties')
@RequiresPermission('finance.penalties:view')
export class PenaltiesController {
  constructor(private readonly penalties: PenaltiesService) {}

  @Get()
  @ScopedHrData()
  list(@Query() query: ListPenaltiesDto, @CurrentUser() user: JwtUser) {
    return this.penalties.list(query, user);
  }

  @Post()
  @ScopedHrData()
  @RequiresPermission('finance.penalties:create')
  create(@Body() dto: CreatePenaltyDto, @CurrentUser() user: JwtUser) {
    return this.penalties.create(dto, user, user.sub, user.name);
  }

  @Get('bylaw')
  @RequiresPermission('finance.penalties_bylaw:view')
  listBylaws(@Query() query: ListPenaltiesDto) {
    return this.penalties.listBylaws(query);
  }

  @Post('bylaw')
  @RequiresPermission('finance.penalties_bylaw:create')
  createBylaw(@Body() dto: CreateBylawDto, @CurrentUser() user: JwtUser) {
    return this.penalties.createBylaw(dto, user.sub);
  }

  @Patch('bylaw/:id')
  @RequiresPermission('finance.penalties_bylaw:update')
  updateBylaw(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateBylawDto) {
    return this.penalties.updateBylaw(id, dto);
  }

  @Delete('bylaw/:id')
  @RequiresPermission('finance.penalties_bylaw:delete')
  removeBylaw(@Param('id', ParseIntPipe) id: number) {
    return this.penalties.removeBylaw(id);
  }

  @Patch(':id')
  @ScopedHrData()
  @RequiresPermission('finance.penalties:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePenaltyDto, @CurrentUser() user: JwtUser) {
    return this.penalties.update(id, dto, user);
  }

  @Patch(':id/investigate')
  @ScopedHrData()
  @RequiresPermission('finance.penalties:update')
  investigate(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.penalties.investigate(id, user);
  }

  @Patch(':id/approve')
  @ScopedHrData()
  @RequiresPermission('finance.penalties:approve')
  approve(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.penalties.approve(id, user);
  }

  @Patch(':id/reject')
  @ScopedHrData()
  @RequiresPermission('finance.penalties:reject')
  reject(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.penalties.reject(id, user);
  }

  @Delete(':id')
  @ScopedHrData()
  @RequiresPermission('finance.penalties:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.penalties.remove(id, user);
  }
}
