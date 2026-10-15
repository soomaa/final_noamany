import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AppManagementModule } from '../app-management/app-management.module';
import { MemberAuthController, MemberController } from './member.controller';
import { MemberCompatController } from './member-compat.controller';
import { MemberGuestController } from './member-guest.controller';
import { ClubBranchesModule } from '../club-branches/club-branches.module';
import { MemberAuthService } from './member-auth.service';
import { MemberService } from './member.service';
import { MemberJwtStrategy } from './strategies/member-jwt.strategy';
import { GateAccessModule } from '../gate-access/gate-access.module';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [ConfigModule, PassportModule, JwtModule.register({}), AppManagementModule, GateAccessModule, UploadsModule, ClubBranchesModule],
  controllers: [MemberAuthController, MemberController, MemberCompatController, MemberGuestController],
  providers: [MemberAuthService, MemberService, MemberJwtStrategy],
  exports: [MemberAuthService, MemberService],
})
export class MemberModule {}
