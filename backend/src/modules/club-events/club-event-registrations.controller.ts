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
import { Transform } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ClubEventRegistrationsService } from './club-event-registrations.service';
import { ListClubEventRegistrationsDto } from './dto/list-club-event-registrations.dto';
import { ClubEventScopeService } from './club-event-scope.service';
import { JwtUser } from '../../common/types/jwt-user';
import { RegisterClubEventDto } from './dto/register-club-event.dto';
import { PayClubEventRegistrationDto } from './dto/pay-club-event-registration.dto';
import { RefundClubEventRegistrationDto } from './dto/refund-club-event-registration.dto';
import { PatchClubEventRegistrationDto } from './dto/patch-club-event-registration.dto';

class CancelRegistrationBody {
  @IsOptional()
  @IsString()
  reason?: string;
}

class RefundQuery {
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  cancel?: boolean;
}

@UseGuards(JwtAuthGuard)
@Controller('club-events/registrations')
@RequiresPermission('club.events.registrations:view')
export class ClubEventRegistrationsController {
  constructor(
    private readonly service: ClubEventRegistrationsService,
    private readonly scope: ClubEventScopeService,
  ) {}

  @Get()
  list(@Query() query: ListClubEventRegistrationsDto, @CurrentUser() user: JwtUser) {
    return this.service.list(query, this.scope.eventBranchFilter(user), this.scope.memberGender(user));
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    await this.scope.assertRegistration(user, id);
    return this.service.findOne(id);
  }

  @Post()
  @RequiresPermission('club.events.registrations:create')
  async register(@Body() body: RegisterClubEventDto, @CurrentUser() user: JwtUser) {
    await this.scope.assertEvent(user, body.eventId);
    await this.scope.assertMember(user, body.memberId);
    if (body.branchId != null) this.scope.assertBranch(user, body.branchId);
    return this.service.register(body, user.sub);
  }

  @Patch(':id')
  @RequiresPermission('club.events.registrations:update')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: PatchClubEventRegistrationDto,
    @CurrentUser() user: JwtUser,
  ) {
    await this.scope.assertRegistration(user, id);
    return this.service.update(id, body, user.sub);
  }

  @Post(':id/pay')
  @RequiresPermission('club.events.registrations:update')
  async pay(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: PayClubEventRegistrationDto,
    @CurrentUser() user: JwtUser,
  ) {
    await this.scope.assertRegistration(user, id);
    return this.service.pay(id, body, user.sub);
  }

  @Post(':id/refund')
  @RequiresPermission('club.events.registrations:update')
  async refund(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: RefundClubEventRegistrationDto,
    @Query() query: RefundQuery,
    @CurrentUser() user: JwtUser,
  ) {
    await this.scope.assertRegistration(user, id);
    return this.service.refund(id, body, query.cancel === true, user.sub);
  }

  @Post(':id/cancel')
  @RequiresPermission('club.events.registrations:update')
  async cancel(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: CancelRegistrationBody,
    @CurrentUser() user: JwtUser,
  ) {
    await this.scope.assertRegistration(user, id);
    return this.service.cancel(id, body.reason, user.sub);
  }

  @Post(':id/promote')
  @RequiresPermission('club.events.registrations:update')
  async promote(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    await this.scope.assertRegistration(user, id);
    return this.service.promote(id, user.sub);
  }
}
