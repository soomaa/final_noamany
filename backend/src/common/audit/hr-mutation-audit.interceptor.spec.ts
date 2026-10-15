import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { HrMutationAuditInterceptor } from './hr-mutation-audit.interceptor';

function context(req: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getClass: () => class LeavesController {},
    getHandler: () => function createLeave() {},
  } as never;
}

describe('HrMutationAuditInterceptor', () => {
  it('records successful HR mutations with actor, correlation and entity id', async () => {
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const interceptor = new HrMutationAuditInterceptor(audit as never);
    const next = { handle: jest.fn(() => of({ id: 81 })) } as CallHandler;
    const req = {
      method: 'POST',
      originalUrl: '/api/leaves',
      path: '/api/leaves',
      body: { empId: 17, name: 'Private Employee', password: 'never-log-me', status: 'pending' },
      params: {},
      user: { sub: 9, name: 'مدير' },
      correlationId: 'req-123',
    };

    await new Promise<void>((resolve, reject) => {
      interceptor.intercept(context(req), next).subscribe({ complete: resolve, error: reject });
    });
    expect(audit.log).toHaveBeenNthCalledWith(1, expect.objectContaining({
      entityType: 'leaves',
      entityId: 'collection',
      action: 'http.post.requested',
      actorUserId: 9,
      correlationId: 'req-123',
      after: { empId: '[REDACTED]', name: '[REDACTED]', password: '[REDACTED]', status: 'pending' },
    }));
    expect(audit.log).toHaveBeenNthCalledWith(2, expect.objectContaining({
      entityType: 'leaves',
      entityId: 81,
      action: 'http.post.committed',
      after: { id: '[REDACTED]' },
    }));
  });

  it('never records raw error messages that may contain PII', async () => {
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const interceptor = new HrMutationAuditInterceptor(audit as never);
    const error = Object.assign(new Error('employee@example.test is invalid'), {
      status: 422,
    });
    const next = { handle: jest.fn(() => {
      throw error;
    }) } as unknown as CallHandler;

    await expect(new Promise<void>((resolve, reject) => {
      interceptor.intercept(context({ method: 'PATCH', path: '/api/employees/7', params: { id: '7' }, body: {} }), next)
        .subscribe({ complete: resolve, error: reject });
    })).rejects.toBe(error);

    expect(audit.log).toHaveBeenLastCalledWith(expect.objectContaining({
      action: 'http.patch.failed',
      after: { errorType: 'Error', statusCode: 422 },
    }));
    expect(JSON.stringify(audit.log.mock.calls)).not.toContain('employee@example.test');
  });

  it('does not audit reads or device event batches', async () => {
    const audit = { log: jest.fn() };
    const interceptor = new HrMutationAuditInterceptor(audit as never);
    const next = { handle: () => of({ ok: true }) } as CallHandler;
    for (const req of [
      { method: 'GET', path: '/api/leaves', originalUrl: '/api/leaves' },
      { method: 'POST', path: '/api/attendance/devices/4/events', originalUrl: '/api/attendance/devices/4/events' },
    ]) {
      await new Promise<void>((resolve, reject) => {
        interceptor.intercept(context(req), next).subscribe({ complete: resolve, error: reject });
      });
    }
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('fails closed when the mandatory audit record cannot be persisted', async () => {
    const audit = { log: jest.fn().mockRejectedValue(new Error('audit unavailable')) };
    const interceptor = new HrMutationAuditInterceptor(audit as never);
    const next = { handle: jest.fn(() => of({ id: 81 })) } as CallHandler;

    await expect(new Promise<void>((resolve, reject) => {
      interceptor.intercept(context({ method: 'POST', path: '/api/leaves', body: {} }), next)
        .subscribe({ complete: resolve, error: reject });
    })).rejects.toThrow('audit unavailable');
    expect(next.handle).not.toHaveBeenCalled();
  });
});
