import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtUser } from '../../common/types/jwt-user';
import { AdminAccountsService } from './admin-accounts.service';
import { CreateAdminAccountDto, VerifyAdminPasswordDto } from './dto/admin-account.dto';

@Controller('users/system-admin')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
@RequiresPermission('admin.users:create')
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class AdminAccountsController {
  constructor(private readonly accounts: AdminAccountsService) {}

  @Post('verify')
  @HttpCode(200)
  verify(@CurrentUser() actor: JwtUser, @Body() dto: VerifyAdminPasswordDto) {
    return this.accounts.verify(actor, dto.currentPassword);
  }

  @Post()
  create(@CurrentUser() actor: JwtUser, @Body() dto: CreateAdminAccountDto) {
    return this.accounts.create(actor, dto);
  }
}

