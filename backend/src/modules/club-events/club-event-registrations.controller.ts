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
import { RegisterClubEventDto } from './dto/register-club-event.dto';
import { PayClubEventRegistrationDto } from './dto/pay-club-event-registration.dto';
import { RefundClubEventRegistrationDto } from './dto/refund-club-event-registration.dto';
import { PatchClubEventRegistrationDto } from './dto/patch-club-event-registration.dto';
import { JwtUser } from '../../common/types/jwt-user';

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
  constructor(private readonly service: ClubEventRegistrationsService) {}

  @Get()
  list(@Query() query: ListClubEventRegistrationsDto, @CurrentUser() user: JwtUser) {
    return this.service.list(query, user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user);
  }

  @Post()
  @RequiresPermission('club.events.registrations:create')
  register(@Body() body: RegisterClubEventDto, @CurrentUser() user: JwtUser) {
    return this.service.register(body, user.sub, undefined, user);
  }

  @Patch(':id')
  @RequiresPermission('club.events.registrations:update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: PatchClubEventRegistrationDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.update(id, body, user.sub, user);
  }

  @Post(':id/pay')
  @RequiresPermission('club.events.registrations:update')
  pay(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: PayClubEventRegistrationDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.pay(id, body, user.sub, user);
  }

  @Post(':id/refund')
  @RequiresPermission('club.events.registrations:update')
  refund(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: RefundClubEventRegistrationDto,
    @Query() query: RefundQuery,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.refund(id, body, query.cancel === true, user.sub, user);
  }

  @Post(':id/cancel')
  @RequiresPermission('club.events.registrations:update')
  cancel(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: CancelRegistrationBody,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.cancel(id, body.reason, user.sub, user);
  }

  @Post(':id/promote')
  @RequiresPermission('club.events.registrations:update')
  promote(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.promote(id, user.sub, user);
  }
}

