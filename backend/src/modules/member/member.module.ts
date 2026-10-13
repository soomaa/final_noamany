import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AppManagementModule } from '../app-management/app-management.module';
import { PublicPortalModule } from '../public-portal/public-portal.module';
import { MemberAuthController, MemberController } from './member.controller';
import { MemberCompatController } from './member-compat.controller';
import { MemberLegacyApiController } from './member-legacy-api.controller';
import { OnlineCoachingMemberController } from './online-coaching-member.controller';
import { MemberAuthService } from './member-auth.service';
import { MemberLegacyApiService } from './member-legacy-api.service';
import { MemberService } from './member.service';
import { MemberJwtStrategy } from './strategies/member-jwt.strategy';
import { OptionalMemberJwtAuthGuard } from './guards/optional-member-jwt-auth.guard';

@Module({
  imports: [ConfigModule, PassportModule, JwtModule.register({}), AppManagementModule, PublicPortalModule],
  controllers: [MemberAuthController, MemberController, MemberCompatController, MemberLegacyApiController, OnlineCoachingMemberController],
  providers: [MemberAuthService, MemberService, MemberJwtStrategy, MemberLegacyApiService, OptionalMemberJwtAuthGuard],
  exports: [MemberAuthService, MemberService],
})
export class MemberModule {}
