import { firstValueFrom, of } from 'rxjs';
import {
  contactVisibilityStore,
  isCustomerDataRoute,
  isStaffRowRoute,
  maskContactTree,
  normalizeRoute,
  stripMaskedWrites,
} from './contact-masking';
import { ContactMaskingInterceptor } from './contact-masking.interceptor';
import { ExportService } from '../export/export.service';

const hidden = { phones: false, sensitive: false };
const shown = { phones: true, sensitive: true };

describe('maskContactTree', () => {
  it('masks every customer number and ID wherever it sits in the payload', () => {
    const out = maskContactTree({
      data: [{ name: 'منى', phone: '01012345678', guardian_phone: '01198765432', cardNumber: '12345' }],
      member: { memberPhone: '01000000011', national_id: '29901011234567' },
    }, hidden);

    // cardNumber is the member's barcode card in Noamany — never masked.
    expect(out.data[0]).toEqual({ name: 'منى', phone: '*********78', guardian_phone: '*********32', cardNumber: '12345' });
    expect(out.member).toEqual({ memberPhone: '*********11', national_id: '**************' });
  });

  it('leaves a staff member\'s own phone readable, but not a customer number inside it', () => {
    const out = maskContactTree({
      phone: '01012345678',
      trainer: { name: 'كابتن أميرة', phone: '01055555555' },
      assignedTo: { phone: '01066666666' },
      reps: [{ phone: '01077777777', memberPhone: '01088888888' }],
    }, hidden);

    expect(out.phone).toBe('*********78');
    expect(out.trainer.phone).toBe('01055555555');
    expect(out.reps[0]).toEqual({ phone: '01077777777', memberPhone: '*********88' });
  });

  it('treats the rows of a staff route as staff', () => {
    const out = maskContactTree({ total: 1, data: [{ name: 'كابتن هدى', phone: '01055555555' }] }, hidden, { staffRows: true });
    expect(out.data[0].phone).toBe('01055555555');
  });

  it('returns the payload untouched for someone holding both grants', () => {
    const payload = { phone: '01012345678' };
    expect(maskContactTree(payload, shown)).toBe(payload);
  });

  it('masks numbers and IDs independently', () => {
    const out = maskContactTree({ phone: '01012345678', nationalId: '12345' }, { phones: true, sensitive: false });
    expect(out).toEqual({ phone: '01012345678', nationalId: '*****' });
  });

  it('passes dates and class instances through', () => {
    const when = new Date('2026-09-23T10:00:00Z');
    expect(maskContactTree({ createdAt: when }, hidden).createdAt).toBe(when);
  });
});

describe('stripMaskedWrites', () => {
  it('drops the stars an edit form was shown, so the stored number is left alone', () => {
    const body: Record<string, unknown> = { name: 'منى', phone: '*********78', guardianPhone: '01198765432', nested: { national_id: '*****' } };
    stripMaskedWrites(body);
    expect(body).toEqual({ name: 'منى', guardianPhone: '01198765432', nested: {} });
  });
});

describe('routes', () => {
  it('masks customer screens only', () => {
    expect(isCustomerDataRoute(normalizeRoute('/api/club-members?page=1'))).toBe(true);
    expect(isCustomerDataRoute('/club-members/sales-portal')).toBe(true);
    expect(isCustomerDataRoute('/club-leads')).toBe(true);
    expect(isCustomerDataRoute('/club/search')).toBe(true);
    expect(isCustomerDataRoute('/employees')).toBe(false);
    expect(isCustomerDataRoute('/member/profile')).toBe(false);
    expect(isCustomerDataRoute('/club-members-archive')).toBe(false);
  });

  it('leaves the routes that need the real number alone', () => {
    for (const route of [
      '/wa-campaigns', '/wa-reminders/absence', '/wa-ext/queue', // WhatsApp sending
      '/club/backup/members.csv', '/club/gym-policies', // admin backups, settings
      '/club-reception-invitations', '/club-staff-invitations', // guest → member conversion
      '/auth/login', '/Api/members/login', '/mobile/profile', '/app/me',
    ]) expect(isCustomerDataRoute(normalizeRoute(`/api${route}`))).toBe(false);
  });

  it('knows which customer routes list staff', () => {
    expect(isStaffRowRoute('/club-mos/calls-log/reps')).toBe(true);
    expect(isStaffRowRoute('/club-mos/calls-log')).toBe(false);
  });
});

describe('ContactMaskingInterceptor', () => {
  const build = (vis: { phones: boolean; sensitive: boolean }, reveals = false) => {
    const visibility = { forUser: jest.fn().mockResolvedValue({ ...vis, employeeId: null }) };
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(reveals) };
    return { interceptor: new ContactMaskingInterceptor(visibility as never, reflector as never), visibility };
  };
  const ctx = (url: string, user: object | undefined, body?: object) => ({
    getType: () => 'http',
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ originalUrl: url, user, body }) }),
  }) as never;

  it('masks a customer list for staff without the grant', async () => {
    const { interceptor } = build(hidden);
    const stream = await interceptor.intercept(ctx('/api/club-members', { sub: 5 }), { handle: () => of({ data: [{ phone: '01012345678' }] }) });
    await expect(firstValueFrom(stream)).resolves.toEqual({ data: [{ phone: '*********78' }] });
  });

  it('never masks the member app or non-customer routes', async () => {
    const { interceptor, visibility } = build(hidden);
    const payload = { phone: '01012345678' };
    for (const [url, user] of [['/api/member/profile', { sub: 9, type: 'member' }], ['/api/employees', { sub: 5 }]] as const) {
      const stream = await interceptor.intercept(ctx(url, user), { handle: () => of(payload) });
      await expect(firstValueFrom(stream)).resolves.toBe(payload);
    }
    expect(visibility.forUser).not.toHaveBeenCalled();
  });

  it('lets an audited reveal endpoint return the real number', async () => {
    const { interceptor } = build(hidden, true);
    const stream = await interceptor.intercept(ctx('/api/club-members/4/phone', { sub: 5 }), { handle: () => of({ phone: '01012345678' }) });
    await expect(firstValueFrom(stream)).resolves.toEqual({ phone: '01012345678' });
  });

  it('strips masked values from writes even for someone allowed to read them', async () => {
    const { interceptor } = build(shown);
    const body: Record<string, unknown> = { phone: '*********78', name: 'منى' };
    await interceptor.intercept(ctx('/api/club-members/4', { sub: 5 }, body), { handle: () => of({}) });
    expect(body).toEqual({ name: 'منى' });
  });

  it('keeps the caller\'s visibility in scope for an Excel export written by the handler', async () => {
    const { interceptor } = build(hidden);
    const exporter = new ExportService();
    let csv = '';
    const handler = { handle: () => { csv = exporter.toCsv([{ key: 'phone', header: 'الهاتف' }], [{ phone: '01012345678' }]); return of(undefined); } };
    await firstValueFrom(await interceptor.intercept(ctx('/api/club-leads/export', { sub: 5 }), handler));
    expect(csv).toContain('*********78');
    expect(csv).not.toContain('01012345678');
    expect(contactVisibilityStore.getStore()).toBeUndefined();
  });
});
