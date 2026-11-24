import { Global, Module } from '@nestjs/common';
import { ContactVisibilityService } from './contact-visibility.service';

/**
 * Global so every service that returns member data can mask it without each feature module
 * re-importing the plumbing — the point of masking is that nothing is exempt.
 */
@Global()
@Module({
  providers: [ContactVisibilityService],
  exports: [ContactVisibilityService],
})
export class PrivacyModule {}
