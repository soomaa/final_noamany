import { generateKeyPairSync } from 'crypto';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { hashDeviceToken, PushService } from './push.service';

describe('PushService member app', () => {
  const prisma = {
    club_member_device_tokens: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    club_members: { findUnique: jest.fn() },
  };
  const fetchMock = jest.fn();
  const originalFetch = global.fetch;

  function useServiceAccount() {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const file = join(mkdtempSync(join(tmpdir(), 'fcm-')), 'sa.json');
    writeFileSync(file, JSON.stringify({
      project_id: 'noamany-test',
      client_email: 'push@noamany-test.iam.gserviceaccount.com',
      private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    }));
    process.env.FIREBASE_SERVICE_ACCOUNT_FILE = file;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as never;
    prisma.club_members.findUnique.mockResolvedValue({ branch_id: 3, gender: 'female' });
    prisma.club_member_device_tokens.deleteMany.mockResolvedValue({ count: 1 });
    prisma.club_member_device_tokens.updateMany.mockResolvedValue({ count: 1 });
  });
  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.FIREBASE_SERVICE_ACCOUNT_FILE;
  });

  it('upserts by token hash, re-points the token to the caller and returns the topics', async () => {
    const service = new PushService(prisma as never);
    await expect(service.registerMemberDevice(42, { token: ' tok-abc ', platform: 'android', appVersion: '1.2.0' }))
      .resolves.toEqual({ ok: true, topics: ['noamany_members', 'noamany_branch_3', 'noamany_gender_female'] });

    const arg = prisma.club_member_device_tokens.upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ token_hash: hashDeviceToken('tok-abc') });
    // the update branch moves a token that belonged to another member to this one and revives it
    expect(arg.update).toEqual(expect.objectContaining({
      member_id: 42, token: 'tok-abc', platform: 'android', app_version: '1.2.0', invalid_at: null,
      last_seen_at: expect.any(Date),
    }));
    expect(arg.create).toEqual(expect.objectContaining({ member_id: 42, token_hash: hashDeviceToken('tok-abc') }));
  });

  it('omits the gender topic when the member gender is unknown', async () => {
    prisma.club_members.findUnique.mockResolvedValue({ branch_id: 7, gender: null });
    await expect(new PushService(prisma as never).memberTopics(1)).resolves.toEqual(['noamany_members', 'noamany_branch_7']);
  });

  it('deletes only the caller\'s own token', async () => {
    await new PushService(prisma as never).removeMemberDevice(42, 'tok-abc');
    expect(prisma.club_member_device_tokens.deleteMany).toHaveBeenCalledWith({
      where: { token_hash: hashDeviceToken('tok-abc'), member_id: 42 },
    });
  });

  it('sends the member message shape and marks UNREGISTERED tokens invalid', async () => {
    useServiceAccount();
    prisma.club_member_device_tokens.findMany.mockResolvedValue([
      { id: 1, member_id: 42, token: 'good-token' },
      { id: 2, member_id: 42, token: 'dead-token' },
    ]);
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'oauth-1', expires_in: 3600 }) })
      .mockResolvedValueOnce({ ok: true, text: async () => '{}' })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => JSON.stringify({ error: {
          code: 404, status: 'NOT_FOUND', message: 'Requested entity was not found.',
          details: [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode: 'UNREGISTERED' }],
        } }),
      });

    const service = new PushService(prisma as never);
    await expect(service.sendToMembers([42, 42], { type: 'general', id: 9, title: 'عرض', body: 'خصم', link: 'noamany://offers' }))
      .resolves.toEqual({ sent: 1, invalid: 1, devices: 2 });

    expect(prisma.club_member_device_tokens.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { member_id: { in: [42] }, invalid_at: null },
    }));
    const { message } = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(message).toEqual({
      token: 'good-token',
      notification: { title: 'عرض', body: 'خصم' },
      data: { type: 'general', id: '9', title: 'عرض', body: 'خصم', link: 'noamany://offers' },
      android: { priority: 'HIGH', notification: { channel_id: 'noamany_default', sound: 'default' } },
      apns: { payload: { aps: { sound: 'default' } } },
    });
    expect(prisma.club_member_device_tokens.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [2] } },
      data: { invalid_at: expect.any(Date) },
    });
  });

  it('keeps tokens on a message-level INVALID_ARGUMENT and never throws on network errors', async () => {
    expect(PushService.isDeadTokenError(JSON.stringify({ error: { status: 'INVALID_ARGUMENT', message: 'Invalid JSON payload received.' } }))).toBe(false);
    expect(PushService.isDeadTokenError(JSON.stringify({ error: { status: 'INVALID_ARGUMENT', message: 'The registration token is not a valid FCM registration token' } }))).toBe(true);

    useServiceAccount();
    prisma.club_member_device_tokens.findMany.mockResolvedValue([{ id: 1, member_id: 42, token: 'tok' }]);
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'oauth-1', expires_in: 3600 }) })
      .mockRejectedValueOnce(new Error('socket hang up'));
    await expect(new PushService(prisma as never).sendToMembers([42], { type: 'general', id: 1, title: 't', body: 'b' }))
      .resolves.toEqual({ sent: 0, invalid: 0, devices: 1 });
    expect(prisma.club_member_device_tokens.updateMany).not.toHaveBeenCalled();
  });

  it('sends to a topic without data.link when none is given', async () => {
    useServiceAccount();
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'oauth-1', expires_in: 3600 }) })
      .mockResolvedValueOnce({ ok: true, text: async () => '{}' });
    await expect(new PushService(prisma as never).sendToTopic('noamany_branch_3', { type: 'general', id: 0, title: 't', body: 'b' }))
      .resolves.toBe(true);
    const { message } = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(message.topic).toBe('noamany_branch_3');
    expect(message.token).toBeUndefined();
    expect(message.data).toEqual({ type: 'general', id: '0', title: 't', body: 'b' });
  });
});
