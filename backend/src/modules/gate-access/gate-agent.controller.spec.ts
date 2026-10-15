import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { GateAccessService } from './gate-access.service';
import { GateAgentController } from './gate-agent.controller';

describe('Gate Agent read-only diagnostic status', () => {
  let app: INestApplication;
  let baseUrl: string;
  const token = 'one80g_test-token-with-at-least-32-characters';
  const row = {
    id: 7,
    model: 'INBIO160-PRO', static_ip: '192.168.1.202', port: 4370, entry_door_no: 1, exit_door_no: 0,
    is_active: true,
    status: 'online',
    last_seen_at: new Date('2026-09-20T10:00:00.000Z'),
    last_sync_at: new Date('2026-09-20T09:59:00.000Z'),
    agent_token_hash: createHash('sha256').update(token).digest('hex'),
    agent_token_prefix: 'one80g_test',
    last_error: 'private controller details',
  };
  const findUnique = jest.fn(async () => row);

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [GateAgentController],
      providers: [
        { provide: PrismaService, useValue: { gate_controllers: { findUnique } } },
        // Status must use the authenticated row; other operations are unavailable.
        { provide: GateAccessService, useValue: {} },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterAll(async () => { await app?.close(); });
  beforeEach(() => {
    row.is_active = true;
    findUnique.mockClear();
  });

  it('returns only diagnostic fields from the guard read without invoking sync or command services', async () => {
    const response = await fetch(`${baseUrl}/gate-agent/7/status`, {
      headers: { 'X-Gate-Agent-Token': token },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: 7,
      isActive: true,
      status: 'online',
      lastSeenAt: '2026-09-20T10:00:00.000Z',
      lastSyncAt: '2026-09-20T09:59:00.000Z',
      controller: { model: 'INBIO160-PRO', staticIp: '192.168.1.202', port: 4370, entryDoorNo: 1, exitDoorNo: 0 },
    });
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(findUnique).toHaveBeenCalledWith({ where: { id: 7 } });
  });

  it.each([undefined, 'one80g_incorrect-token-with-at-least-32-characters'])(
    'rejects missing or incorrect saved credentials (%s)', async (suppliedToken) => {
      const response = await fetch(`${baseUrl}/gate-agent/7/status`, {
        headers: suppliedToken ? { 'X-Gate-Agent-Token': suppliedToken } : {},
      });
      expect(response.status).toBe(401);
    },
  );

  it('rejects disabled controllers', async () => {
    row.is_active = false;
    const response = await fetch(`${baseUrl}/gate-agent/7/status`, {
      headers: { 'X-Gate-Agent-Token': token },
    });
    expect(response.status).toBe(403);
  });
});
