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
import { AgentsService } from './agents.service';
import { CreateAgentDto, ListAgentsDto, UpdateAgentDto } from './dto/agents.dto';

@UseGuards(JwtAuthGuard)
@Controller('agents')
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  @Get()
  list(@Query() query: ListAgentsDto) {
    return this.agents.list(query);
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.agents.get(id);
  }

  @Post()
  @RequiresPermission('admin.users:create')
  create(@Body() dto: CreateAgentDto) {
    return this.agents.create(dto);
  }

  @Patch(':id')
  @RequiresPermission('admin.users:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAgentDto) {
    return this.agents.update(id, dto);
  }

  @Delete(':id')
  @RequiresPermission('admin.users:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.agents.remove(id);
  }
}
