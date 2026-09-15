import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AppManagementModule } from '../app-management/app-management.module';
import { OnlineSubscriptionsModule } from '../online-subscriptions/online-subscriptions.module';
import { MemberAuthController, MemberController } from './member.controller';
import { MemberCompatController } from './member-compat.controller';
import { OnlineCoachingMemberController } from './online-coaching-member.controller';
import { MemberAuthService } from './member-auth.service';
import { MemberService } from './member.service';
import { MemberJwtStrategy } from './strategies/member-jwt.strategy';

@Module({
  imports: [ConfigModule, PassportModule, JwtModule.register({}), AppManagementModule, OnlineSubscriptionsModule],
  controllers: [MemberAuthController, MemberController, MemberCompatController, OnlineCoachingMemberController],
  providers: [MemberAuthService, MemberService, MemberJwtStrategy],
  exports: [MemberAuthService, MemberService],
})
export class MemberModule {}
