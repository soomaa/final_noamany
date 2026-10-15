import { Module } from '@nestjs/common';
import { ClubMembersModule } from '../club-members/club-members.module';
import { GymOpsModule } from '../gym-ops/gym-ops.module';
import { GateAccessController } from './gate-access.controller';
import { GateAccessService } from './gate-access.service';
import { GateAgentController } from './gate-agent.controller';
import { GateAgentAuthGuard } from './gate-agent-auth.guard';
import { GateCredentialModule } from './gate-credential.module';
import { GatePushController } from './gate-push.controller';
import { GatePushService } from './gate-push.service';

@Module({
  imports: [ClubMembersModule, GymOpsModule, GateCredentialModule],
  controllers: [GateAccessController, GateAgentController, GatePushController],
  providers: [GateAccessService, GateAgentAuthGuard, GatePushService],
  exports: [GateAccessService, GateCredentialModule],
})
export class GateAccessModule {}
