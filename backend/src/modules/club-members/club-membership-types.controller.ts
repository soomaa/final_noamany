import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { assertSystemAdmin } from '../../common/utils/system-admin.util';
import { JwtUser } from '../../common/types/jwt-user';
import { ClubMembershipTypesService } from './club-membership-types.service';
import { UpsertMembershipTypeDto } from './dto/upsert-membership-type.dto';

@UseGuards(JwtAuthGuard)
@Controller('club-membership-types')
@RequiresPermission('club.members:view')
export class ClubMembershipTypesController {
  constructor(private readonly service: ClubMembershipTypesService) {}

  @Get()
  list() {
    return this.service.listActive();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequiresPermission('club.members:create')
  create(@Body() body: UpsertMembershipTypeDto) {
    return this.service.create(body);
  }

  @Put(':id')
  @RequiresPermission('club.members:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Partial<UpsertMembershipTypeDto>) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @RequiresPermission('club.members:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    assertSystemAdmin(user);
    return this.service.remove(id);
  }
}
