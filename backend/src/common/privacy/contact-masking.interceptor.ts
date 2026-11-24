import { CallHandler, ExecutionContext, Injectable, NestInterceptor, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, map } from 'rxjs';
import { ContactVisibilityService } from './contact-visibility.service';
import {
  contactVisibilityStore,
  isCustomerDataRoute,
  isStaffRowRoute,
  maskContactTree,
  normalizeRoute,
  stripMaskedWrites,
} from './contact-masking';

export const REVEALS_CONTACT_KEY = 'revealsContact';

/**
 * Marks the audited single-record reveal endpoints: their whole purpose is to return one real
 * number, so the response masking skips them. Never put this on a list.
 */
export const RevealsContact = () => SetMetadata(REVEALS_CONTACT_KEY, true);

/**
 * Masks customer phone numbers and ID documents on every customer-data route, for any staff caller
 * without `viewPhone` / `viewSensitive` on a customer screen (FIT90's contact-privacy model).
 *
 * Runs after the auth guards, so `req.user` is known. It also strips masked values out of incoming
 * writes whoever the caller is: a form that was shown stars must leave the stored number alone.
 * The member app is never masked — a member reading their own number is not a leak.
 */
@Injectable()
export class ContactMaskingInterceptor implements NestInterceptor {
  constructor(
    private readonly visibility: ContactVisibilityService,
    private readonly reflector: Reflector,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<{
      originalUrl?: string;
      url?: string;
      body?: unknown;
      user?: { sub?: number; type?: string };
    }>();
    const route = normalizeRoute(req.originalUrl ?? req.url ?? '');
    const user = req.user;
    if (!user?.sub || user.type === 'member' || route.startsWith('/member') || !isCustomerDataRoute(route)) {
      return next.handle();
    }

    if (req.body && typeof req.body === 'object') stripMaskedWrites(req.body);

    const reveals = this.reflector.getAllAndOverride<boolean>(REVEALS_CONTACT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (reveals) return next.handle();

    const vis = await this.visibility.forUser(user as never);
    if (vis.phones && vis.sensitive) return next.handle();
    const staffRows = isStaffRowRoute(route);

    // Subscribe inside the store so the handler — including one that streams an Excel file
    // straight to the response — runs with this caller's visibility in scope.
    return new Observable((subscriber) =>
      contactVisibilityStore.run({ phones: vis.phones, sensitive: vis.sensitive }, () =>
        next
          .handle()
          .pipe(map((body) => maskContactTree(body, vis, { staffRows })))
          .subscribe(subscriber),
      ),
    );
  }
}
