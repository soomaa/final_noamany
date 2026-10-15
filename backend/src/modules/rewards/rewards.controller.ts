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
import { CreateRewardDto, UpdateRewardDto } from './dto/reward.dto';
import { ListRewardsDto } from './dto/list-rewards.dto';
import { RewardsService } from './rewards.service';
import { ScopedHrData } from '../../common/hr-scope/scoped-hr-data.decorator';

@UseGuards(JwtAuthGuard)
@Controller('rewards')
@RequiresPermission('finance.rewards:view')
export class RewardsController {
  constructor(private readonly rewards: RewardsService) {}

  @Get()
  @ScopedHrData()
  list(@Query() query: ListRewardsDto, @CurrentUser() user: JwtUser) {
    return this.rewards.list(query, user);
  }

  @Post()
  @ScopedHrData()
  @RequiresPermission('finance.rewards:create')
  create(@Body() dto: CreateRewardDto, @CurrentUser() user: JwtUser) {
    return this.rewards.create(dto, user, user.sub);
  }

  @Patch(':id')
  @ScopedHrData()
  @RequiresPermission('finance.rewards:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRewardDto, @CurrentUser() user: JwtUser) {
    return this.rewards.update(id, dto, user);
  }

  @Patch(':id/approve')
  @ScopedHrData()
  @RequiresPermission('finance.rewards:approve')
  approve(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.rewards.approve(id, user);
  }

  @Patch(':id/reject')
  @ScopedHrData()
  @RequiresPermission('finance.rewards:reject')
  reject(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.rewards.reject(id, user);
  }

  @Delete(':id')
  @ScopedHrData()
  @RequiresPermission('finance.rewards:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.rewards.remove(id, user);
  }
}
