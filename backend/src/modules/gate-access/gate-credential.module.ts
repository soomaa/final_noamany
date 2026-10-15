import { Module } from '@nestjs/common';
import { GateCredentialService } from './gate-credential.service';

/** Shared without importing gate controllers or member attendance services. */
@Module({
  providers: [GateCredentialService],
  exports: [GateCredentialService],
})
export class GateCredentialModule {}
