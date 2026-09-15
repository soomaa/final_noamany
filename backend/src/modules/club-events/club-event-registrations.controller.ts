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
  list(@Query() query: ListClubEventRegistrationsDto) {
    return this.service.list(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequiresPermission('club.events.registrations:create')
  register(@Body() body: RegisterClubEventDto, @CurrentUser('sub') userId: number) {
    return this.service.register(body, userId);
  }

  @Patch(':id')
  @RequiresPermission('club.events.registrations:update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: PatchClubEventRegistrationDto,
    @CurrentUser('sub') userId: number,
  ) {
    return this.service.update(id, body, userId);
  }

  @Post(':id/pay')
  @RequiresPermission('club.events.registrations:update')
  pay(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: PayClubEventRegistrationDto,
    @CurrentUser('sub') userId: number,
  ) {
    return this.service.pay(id, body, userId);
  }

  @Post(':id/refund')
  @RequiresPermission('club.events.registrations:update')
  refund(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: RefundClubEventRegistrationDto,
    @Query() query: RefundQuery,
    @CurrentUser('sub') userId: number,
  ) {
    return this.service.refund(id, body, query.cancel === true, userId);
  }

  @Post(':id/cancel')
  @RequiresPermission('club.events.registrations:update')
  cancel(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: CancelRegistrationBody,
    @CurrentUser('sub') userId: number,
  ) {
    return this.service.cancel(id, body.reason, userId);
  }

  @Post(':id/promote')
  @RequiresPermission('club.events.registrations:update')
  promote(@Param('id', ParseIntPipe) id: number, @CurrentUser('sub') userId: number) {
    return this.service.promote(id, userId);
  }
}
