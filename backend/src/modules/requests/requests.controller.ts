import {
  Body,
  Controller,
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
import { CreateRequestDto } from './dto/create-request.dto';
import { ListRequestsDto } from './dto/list-requests.dto';
import { RequestsService } from './requests.service';
import { ScopedHrData } from '../../common/hr-scope/scoped-hr-data.decorator';

@UseGuards(JwtAuthGuard)
@Controller('requests')
@RequiresPermission('leaves.requests:view')
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Get()
  @ScopedHrData()
  list(@Query() query: ListRequestsDto, @CurrentUser() user: JwtUser) {
    return this.requests.list(query, user);
  }

  @Post()
  @ScopedHrData()
  @RequiresPermission('leaves.requests:create')
  create(@Body() dto: CreateRequestDto, @CurrentUser() user: JwtUser) {
    return this.requests.create(dto, user.sub, user.name, user.employeeId);
  }

  @Get(':id')
  @ScopedHrData()
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.requests.findOne(id, user);
  }

  @Patch(':id/approve')
  @ScopedHrData()
  @RequiresPermission('leaves.requests:approve')
  approve(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtUser,
    @Query('dryRun') dryRun?: string,
  ) {
    return this.requests.approve(id, user, dryRun === 'true' || dryRun === '1');
  }

  @Patch(':id/reject')
  @ScopedHrData()
  @RequiresPermission('leaves.requests:reject')
  reject(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.requests.reject(id, user);
  }
}
