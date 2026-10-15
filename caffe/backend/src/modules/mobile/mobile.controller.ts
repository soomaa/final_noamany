import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtUser } from '../../common/types/jwt-user';
import { MobileService } from './mobile.service';
import {
  CreateLeaveDto,
  CreateVisitDto,
  DeviceTokenDto,
  MobileLoginDto,
} from './dto/mobile.dto';

@UseGuards(JwtAuthGuard)
@Controller('mobile')
export class MobileController {
  constructor(private readonly mobile: MobileService) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: MobileLoginDto) {
    return this.mobile.login(dto.username, dto.password);
  }

  @Get('profile')
  profile(@CurrentUser() user: JwtUser) {
    return this.mobile.profile(user);
  }

  @Post('device-token')
  @HttpCode(200)
  deviceToken(@Body() dto: DeviceTokenDto, @CurrentUser() user: JwtUser) {
    return this.mobile.setDeviceToken(user, dto.token);
  }

  @Get('notifications')
  notifications(@CurrentUser() user: JwtUser) {
    return this.mobile.notifications(user);
  }

  @Patch('notifications/:id/read')
  markNotificationRead(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtUser,
  ) {
    return this.mobile.markNotificationRead(user, id);
  }

  @Get('leaves')
  leaves(@CurrentUser() user: JwtUser) {
    return this.mobile.leaves(user);
  }

  @Post('leaves')
  createLeave(@Body() dto: CreateLeaveDto, @CurrentUser() user: JwtUser) {
    return this.mobile.createLeave(user, dto);
  }

  @Get('requests')
  requests(@CurrentUser() user: JwtUser) {
    return this.mobile.requests(user);
  }

  @Post('visit')
  createVisit(@Body() dto: CreateVisitDto, @CurrentUser() user: JwtUser) {
    return this.mobile.createVisit(user, dto);
  }
}
