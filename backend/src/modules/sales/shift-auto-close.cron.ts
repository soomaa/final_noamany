import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class ShiftAutoCloseCron {
  private readonly log = new Logger(ShiftAutoCloseCron.name);

  /** Manual handover is authoritative. Kept as a compatibility shell for old imports. */
  handleAutoClose() {
    this.log.debug('Automatic shift closing is disabled; awaiting manual handover');
    return { closed: 0, disabled: true };
  }
}
