import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { JwtUser } from '../../common/types/jwt-user';
import { ActionScreenService } from './action-screen.service';

@UseGuards(JwtAuthGuard)
@Controller('hr/action-screen')
@RequiresPermission('affairs.action_screen:view')
export class ActionScreenController {
  constructor(private readonly service: ActionScreenService) {}

  @Get()
  list(@Query() q: PaginationDto) {
    return this.service.list(q);
  }

  @Get('grades')
  listGrades() {
    return this.service.listGrades();
  }

  // Catalog assigns only view/execute/audit to affairs.action_screen —
  // all mutations therefore require the `execute` action.
  @Post()
  @RequiresPermission('affairs.action_screen:execute')
  create(
    @Body()
    body: {
      jobTitleCodeFk: number;
      personType: number;
      personCode: string;
      personName: string;
      personPrivateName?: string;
      personSuspend?: number;
      fromDate: string;
      toDate: string;
      branchIdFk?: number;
    },
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.create(body, user.sub, user.name);
  }

  @Patch(':id')
  @RequiresPermission('affairs.action_screen:execute')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      jobTitleCodeFk?: number;
      personType?: number;
      personCode?: string;
      personName?: string;
      personPrivateName?: string;
      personSuspend?: number;
      fromDate?: string;
      toDate?: string;
    },
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.update(id, body, user.sub, user.name);
  }

  @Delete(':id')
  @RequiresPermission('affairs.action_screen:execute')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
