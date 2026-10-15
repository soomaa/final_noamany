import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { FlexibleAuthGuard } from '../../common/guards/flexible-auth.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { StaffSessionService } from './staff-session.service';

@Module({
  imports: [ConfigModule, PassportModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, StaffSessionService, JwtStrategy, FlexibleAuthGuard],
  exports: [AuthService, StaffSessionService],
})
export class AuthModule {}
