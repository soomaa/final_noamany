import { SetMetadata } from '@nestjs/common';

export const REQUIRES_PAGE_KEY = 'requiresPage';

/**
 * Closes the legacy security hole: the old app enforced permissions ONLY in the
 * sidebar (any logged-in user could hit any URL). Annotate a route with the
 * legacy `pages.page_link` it corresponds to; PermissionsGuard then checks the
 * user actually has that page in the `permissions` table.
 */
export const RequiresPage = (pageLink: string) => SetMetadata(REQUIRES_PAGE_KEY, pageLink);
