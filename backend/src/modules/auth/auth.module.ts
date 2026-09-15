import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { FlexibleAuthGuard } from '../../common/guards/flexible-auth.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { MemberModule } from '../member/member.module';

@Module({
  imports: [ConfigModule, PassportModule, JwtModule.register({}), forwardRef(() => MemberModule)],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, FlexibleAuthGuard],
  exports: [AuthService],
})
export class AuthModule {}
