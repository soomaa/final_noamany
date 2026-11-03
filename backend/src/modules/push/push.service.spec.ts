import { generateKeyPairSync } from 'crypto';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { PushService } from './push.service';

describe('PushService FCM send', () => {
  const prisma = {
    users: { findUnique: jest.fn() },
    tbl_notifications: { create: jest.fn() },
    users_notifications: { create: jest.fn() },
  };
  const fetchMock = jest.fn();
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as never;
    prisma.users.findUnique.mockResolvedValue({ user_id: 7, device_token: 'device-token-123' });
    prisma.tbl_notifications.create.mockResolvedValue({ id: 501 });
  });
  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.FIREBASE_SERVICE_ACCOUNT_FILE;
  });

  it('sends title and body in both the notification and data blocks', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const file = join(mkdtempSync(join(tmpdir(), 'fcm-')), 'sa.json');
    writeFileSync(file, JSON.stringify({
      project_id: 'hrms-test',
      client_email: 'push@hrms-test.iam.gserviceaccount.com',
      private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    }));
    process.env.FIREBASE_SERVICE_ACCOUNT_FILE = file;
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'oauth-1', expires_in: 3600 }) })
      .mockResolvedValue({ ok: true, text: async () => '{}' });

    const service = new PushService(prisma as never);
    await expect(service.sendToUsers([7, 7], 'تعميم جديد', 'الاجتماع الساعة 10', 1)).resolves.toEqual({ sent: 2, skipped: 0 });

    // one OAuth token, reused for both sends
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toBe('https://oauth2.googleapis.com/token');
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('https://fcm.googleapis.com/v1/projects/hrms-test/messages:send');
    expect(init.headers.Authorization).toBe('Bearer oauth-1');
    const { message } = JSON.parse(init.body);
    expect(message.token).toBe('device-token-123');
    expect(message.notification).toEqual({ title: 'تعميم جديد', body: 'الاجتماع الساعة 10' });
    expect(message.data).toEqual({ title: 'تعميم جديد', body: 'الاجتماع الساعة 10' });
    expect(message.android.notification.channel_id).toBe('com.metacodex.noamanyhr');
  });

  it('only logs when no service account is configured', async () => {
    const service = new PushService(prisma as never);
    await expect(service.sendToUsers([7], 'عنوان', 'نص')).resolves.toEqual({ sent: 1, skipped: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(prisma.users_notifications.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ notify_id_fk: 501, message: 'عنوان — نص' }),
    });
  });
});
