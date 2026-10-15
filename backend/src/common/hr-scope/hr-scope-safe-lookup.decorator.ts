import { SetMetadata } from '@nestjs/common';

export const HR_SCOPE_SAFE_LOOKUP_KEY = 'hr_scope_safe_lookup';

/**
 * Marks a read-only reference-data endpoint that is required by a scoped HR form and
 * contains no employee records (for example job-title options or the next code).
 */
export const HrScopeSafeLookup = () => SetMetadata(HR_SCOPE_SAFE_LOOKUP_KEY, true);
