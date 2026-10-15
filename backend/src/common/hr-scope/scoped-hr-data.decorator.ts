import { SetMetadata } from '@nestjs/common';

export const SCOPED_HR_DATA_KEY = 'scoped_hr_data';

/** Declares that one handler applies a server-side employee/branch predicate. */
export const ScopedHrData = () => SetMetadata(SCOPED_HR_DATA_KEY, true);
