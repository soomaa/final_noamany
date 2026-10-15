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
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { InitiativesService } from './initiatives.service';
import {
  CreateInitiativeDto,
  ListInitiativesDto,
  RejectInitiativeDto,
  UpdateInitiativeDto,
} from './dto/initiatives.dto';

@UseGuards(JwtAuthGuard)
@Controller('initiatives')
export class InitiativesController {
  constructor(private readonly initiatives: InitiativesService) {}

  @Get()
  list(@Query() query: ListInitiativesDto) {
    return this.initiatives.list(query);
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.initiatives.get(id);
  }

  @Post()
  create(@Body() dto: CreateInitiativeDto) {
    return this.initiatives.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateInitiativeDto) {
    return this.initiatives.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.initiatives.remove(id);
  }

  @Post(':id/approve')
  approve(@Param('id', ParseIntPipe) id: number) {
    return this.initiatives.approve(id);
  }

  @Post(':id/reject')
  reject(@Param('id', ParseIntPipe) id: number, @Body() dto: RejectInitiativeDto) {
    return this.initiatives.reject(id, dto);
  }
}
