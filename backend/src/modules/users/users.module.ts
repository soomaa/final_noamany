import { Module } from '@nestjs/common';
import { AdminAccountsController } from './admin-accounts.controller';
import { AdminAccountsService } from './admin-accounts.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  // AdminAccountsController first: its `users/system-admin` routes must not be shadowed by `users/:id`.
  controllers: [AdminAccountsController, UsersController],
  providers: [UsersService, AdminAccountsService],
  exports: [UsersService],
})
export class UsersModule {}
