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

@UseGuards(JwtAuthGuard)
@Controller('penalties')
@RequiresPermission('finance.penalties:view')
export class PenaltiesController {
  constructor(private readonly penalties: PenaltiesService) {}

  @Get()
  list(@Query() query: ListPenaltiesDto) {
    return this.penalties.list(query);
  }

  @Post()
  @RequiresPermission('finance.penalties:create')
  create(@Body() dto: CreatePenaltyDto, @CurrentUser() user: JwtUser) {
    return this.penalties.create(dto, user.sub, user.name);
  }

  @Get('bylaw')
  listBylaws(@Query() query: ListPenaltiesDto) {
    return this.penalties.listBylaws(query);
  }

  @Post('bylaw')
  @RequiresPermission('finance.penalties:create')
  createBylaw(@Body() dto: CreateBylawDto, @CurrentUser() user: JwtUser) {
    return this.penalties.createBylaw(dto, user.sub);
  }

  @Patch('bylaw/:id')
  @RequiresPermission('finance.penalties:update')
  updateBylaw(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateBylawDto) {
    return this.penalties.updateBylaw(id, dto);
  }

  @Delete('bylaw/:id')
  @RequiresPermission('finance.penalties:delete')
  removeBylaw(@Param('id', ParseIntPipe) id: number) {
    return this.penalties.removeBylaw(id);
  }

  @Patch(':id')
  @RequiresPermission('finance.penalties:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePenaltyDto) {
    return this.penalties.update(id, dto);
  }

  @Patch(':id/investigate')
  @RequiresPermission('finance.penalties:update')
  investigate(@Param('id', ParseIntPipe) id: number) {
    return this.penalties.investigate(id);
  }

  @Patch(':id/approve')
  @RequiresPermission('finance.penalties:approve')
  approve(@Param('id', ParseIntPipe) id: number) {
    return this.penalties.approve(id);
  }

  @Patch(':id/reject')
  @RequiresPermission('finance.penalties:reject')
  reject(@Param('id', ParseIntPipe) id: number) {
    return this.penalties.reject(id);
  }

  @Delete(':id')
  @RequiresPermission('finance.penalties:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.penalties.remove(id);
  }
}
