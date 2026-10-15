import { SuspendStatus } from '../../common/utils/suspend-status.util';
import { ACCEPT_SUSPEND } from './approval-chain.util';

describe('leave approval state semantics', () => {
  it('keeps every intermediate approval pending and marks only the final stage approved', () => {
    expect(ACCEPT_SUSPEND.approve_direct_manager).toBe(SuspendStatus.APPROVED_L1);
    expect(ACCEPT_SUSPEND.approve_moder_edara).toBe(SuspendStatus.APPROVED_L1);
    expect(ACCEPT_SUSPEND.approve_hr).toBe(SuspendStatus.APPROVED_L1);
    expect(ACCEPT_SUSPEND.approve_moder_3am).toBe(SuspendStatus.APPROVED);
  });
});
