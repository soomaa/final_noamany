import { Global, Module } from '@nestjs/common';
import { BranchScopeService } from './branch-scope.service';

/** Global so any module's service can inject BranchScopeService for default branch scoping. */
@Global()
@Module({
  providers: [BranchScopeService],
  exports: [BranchScopeService],
})
export class BranchScopeModule {}
