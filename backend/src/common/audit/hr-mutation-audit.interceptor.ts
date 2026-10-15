import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, catchError, defer, from, map, mergeMap, of, throwError } from 'rxjs';
import { BusinessAuditService, sanitizeAuditValue } from './business-audit.service';

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const HR_ROOTS = new Set([
  'employees',
  'leaves',
  'permissions',
  'requests',
  'payroll',
  'loans',
  'missions',
  'penalties',
  'rewards',
  'attendance',
  'documents',
  'hr',
  'termination',
  'salary-scale',
  'forms-settings',
  'loan-settings',
  'insurance-settings',
  'weekly-leaves',
  'sites',
  'departments',
  // Café inventory: who deleted / changed an ingredient, recipe or count (shown in سجل ومشاكل المخزون).
  'products',
  'cafe-products',
  'cafe-bundles',
  'stock-taking',
  'opening-stocks',
  'cafe-waste',
]);

type AuditRequest = {
  method?: string;
  originalUrl?: string;
  path?: string;
  body?: unknown;
  params?: Record<string, string>;
  user?: { sub?: number; name?: string; branch?: number };
  correlationId?: string;
  ip?: string;
};

@Injectable()
export class HrMutationAuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(HrMutationAuditInterceptor.name);
  constructor(private readonly audit: BusinessAuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuditRequest>();
    if (!this.shouldAudit(request)) return next.handle();

    const path = this.pathSegments(request);
    const entityId = request.params?.id ?? 'collection';
    const entityType = path[0] === 'hr' && path[1] ? `hr.${path[1]}` : (path[0] ?? 'hr');
    // Persist the immutable mutation intent before the handler starts. This
    // guarantees an unavailable audit store cannot produce a committed HR
    // mutation followed by a misleading 500 response.
    const base = {
          entityType,
          entityId,
          actorUserId: request.user?.sub,
          branchId: request.user?.branch,
          correlationId: request.correlationId,
    };
    const method = request.method!.toLowerCase();
    return defer(() => from(this.audit.log({
      ...base,
      action: `http.${method}.requested`,
      after: sanitizeAuditValue(request.body),
    }))).pipe(mergeMap(() => defer(() => next.handle()).pipe(
      mergeMap((result) => {
        const resultId = this.resultEntityId(result) ?? entityId;
        return from(this.audit.log({
          ...base,
          entityId: resultId,
          action: `http.${method}.committed`,
          after: sanitizeAuditValue(result),
        })).pipe(
          map(() => result),
          // The mutation has already committed. Never convert a successful
          // operation into a misleading 500; the mandatory requested record
          // remains durable and the write failure is surfaced operationally.
          catchError((error) => {
            this.logger.error('Unable to append committed audit outcome');
            return of(result);
          }),
        );
      }),
      catchError((handlerError) => from(this.audit.log({
        ...base,
        action: `http.${method}.failed`,
        after: this.failureAudit(handlerError),
      })).pipe(
        catchError((auditError) => {
          this.logger.error('Unable to append failed audit outcome');
          return of(undefined);
        }),
        mergeMap(() => throwError(() => handlerError)),
      )),
    )));
  }

  private resultEntityId(result: unknown): string | number | null {
    if (!result || typeof result !== 'object') return null;
    const row = result as Record<string, unknown>;
    for (const key of ['id', 'employeeId', 'mokafaRkm', 'tRkm']) {
      if (typeof row[key] === 'string' || typeof row[key] === 'number') return row[key] as string | number;
    }
    return null;
  }

  private failureAudit(error: unknown): { errorType: string; statusCode: number | null } {
    const candidate = error as {
      name?: unknown;
      status?: unknown;
      statusCode?: unknown;
      getStatus?: () => unknown;
    };
    const fromMethod =
      typeof candidate?.getStatus === 'function' ? candidate.getStatus() : undefined;
    const rawStatus = fromMethod ?? candidate?.statusCode ?? candidate?.status;
    return {
      errorType:
        error instanceof Error && /^[A-Za-z][A-Za-z0-9]*$/.test(error.name)
          ? error.name
          : 'UnknownError',
      statusCode:
        typeof rawStatus === 'number' && Number.isInteger(rawStatus)
          ? rawStatus
          : null,
    };
  }

  private shouldAudit(request: AuditRequest): boolean {
    if (!request.method || !MUTATION_METHODS.has(request.method.toUpperCase())) return false;
    const segments = this.pathSegments(request);
    if (!segments.length || !HR_ROOTS.has(segments[0])) return false;
    // Device batches already have an immutable, deduplicated event ledger and can be high-volume.
    if (segments[0] === 'attendance' && segments[1] === 'devices' && segments.at(-1) === 'events') {
      return false;
    }
    return true;
  }

  private pathSegments(request: AuditRequest): string[] {
    const raw = (request.path ?? request.originalUrl ?? '').split('?')[0];
    const segments = raw.split('/').filter(Boolean);
    return segments[0] === 'api' ? segments.slice(1) : segments;
  }
}
