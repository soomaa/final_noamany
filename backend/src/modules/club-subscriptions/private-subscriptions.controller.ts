import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtUser } from '../../common/types/jwt-user';
import {
  CreatePrivateEnrollmentDto,
  ListPrivateEnrollmentsDto,
  UpsertPrivatePackageDto,
} from './dto/private-subscriptions.dto';
import { PrivateSubscriptionsService } from './private-subscriptions.service';

@UseGuards(JwtAuthGuard)
@Controller('club-private-subscriptions')
@RequiresPermission('club.subscriptions.special:view', 'club.subscriptions:view')
export class PrivateSubscriptionsController {
  constructor(private readonly service: PrivateSubscriptionsService) {}

  @Get('packages')
  packages(
    @CurrentUser() user: JwtUser,
    @Query('branchId') branchId?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.service.listPackages(user, branchId, includeInactive);
  }

  @Post('packages')
  @RequiresPermission('club.subscriptions.special:create', 'club.subscriptions:create')
  createPackage(@Body() body: UpsertPrivatePackageDto, @CurrentUser() user: JwtUser) {
    return this.service.createPackage(body, user);
  }

  @Put('packages/:id')
  @RequiresPermission('club.subscriptions.special:update', 'club.subscriptions:update')
  updatePackage(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpsertPrivatePackageDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.updatePackage(id, body, user);
  }

  @Delete('packages/:id')
  @RequiresPermission('club.subscriptions.special:delete', 'club.subscriptions:delete')
  deactivatePackage(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.deactivatePackage(id, user);
  }

  @Get('enrollments')
  enrollments(@Query() query: ListPrivateEnrollmentsDto, @CurrentUser() user: JwtUser) {
    return this.service.listEnrollments(query, user);
  }

  @Get('enrollments/:id')
  enrollment(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.findEnrollment(id, user);
  }

  @Post('enrollments')
  @RequiresPermission('club.subscriptions.special:create', 'club.subscriptions:create')
  createEnrollment(@Body() body: CreatePrivateEnrollmentDto, @CurrentUser() user: JwtUser) {
    return this.service.createEnrollment(body, user);
  }
}
