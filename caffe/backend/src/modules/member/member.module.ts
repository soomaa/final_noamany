import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AppManagementModule } from '../app-management/app-management.module';
import { MemberAuthController, MemberController } from './member.controller';
import { MemberCompatController } from './member-compat.controller';
import { MemberAuthService } from './member-auth.service';
import { MemberService } from './member.service';
import { MemberJwtStrategy } from './strategies/member-jwt.strategy';

@Module({
  imports: [ConfigModule, PassportModule, JwtModule.register({}), AppManagementModule],
  controllers: [MemberAuthController, MemberController, MemberCompatController],
  providers: [MemberAuthService, MemberService, MemberJwtStrategy],
  exports: [MemberAuthService, MemberService],
})
export class MemberModule {}
