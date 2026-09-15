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

@UseGuards(JwtAuthGuard)
@Controller('rewards')
@RequiresPermission('finance.rewards:view')
export class RewardsController {
  constructor(private readonly rewards: RewardsService) {}

  @Get()
  list(@Query() query: ListRewardsDto) {
    return this.rewards.list(query);
  }

  @Get('next-number')
  nextNumber() {
    return this.rewards.nextNumber();
  }

  @Post()
  @RequiresPermission('finance.rewards:create')
  create(@Body() dto: CreateRewardDto, @CurrentUser() user: JwtUser) {
    return this.rewards.create(dto, user.sub);
  }

  @Patch(':id')
  @RequiresPermission('finance.rewards:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRewardDto) {
    return this.rewards.update(id, dto);
  }

  @Patch(':id/approve')
  @RequiresPermission('finance.rewards:approve')
  approve(@Param('id', ParseIntPipe) id: number) {
    return this.rewards.approve(id);
  }

  @Patch(':id/reject')
  @RequiresPermission('finance.rewards:reject')
  reject(@Param('id', ParseIntPipe) id: number) {
    return this.rewards.reject(id);
  }

  @Delete(':id')
  @RequiresPermission('finance.rewards:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.rewards.remove(id);
  }
}
