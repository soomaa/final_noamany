import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApprovalActionDto, ListApprovalsDto } from './dto/procurement-ext.dto';
import { ApprovalsService } from './approvals.service';

@UseGuards(JwtAuthGuard)
@Controller('approvals')
@RequiresPermission('gym-sales.procurement:view')
export class ApprovalsController {
  constructor(private readonly service: ApprovalsService) {}

  @Get()
  list(@Query() query: ListApprovalsDto) {
    return this.service.list(query);
  }

  @Post(':id')
  @RequiresPermission('gym-sales.procurement:approve')
  action(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ApprovalActionDto,
    @CurrentUser('sub') userId: number,
  ) {
    return this.service.action(id, body, userId);
  }
}
