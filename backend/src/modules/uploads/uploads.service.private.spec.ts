import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import { UploadsService } from './uploads.service';
import { One80FileCategoryAdapter } from '../../adapters/one80/files/one80-file-category.adapter';

describe('UploadsService private storage', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'hr-private-upload-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function makeService() {
    const tx = {
      private_file_metadata: { create: jest.fn() },
      business_audit_log: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (db: typeof tx) => unknown) => fn(tx)),
      employees: { count: jest.fn().mockResolvedValue(1) },
    };
    const config = {
      get: jest.fn((key: string) => (key === 'privateUploadDir' ? root : undefined)),
    };
    return {
      service: new UploadsService(
        prisma as never,
        config as never,
        { employeeWhere: jest.fn().mockResolvedValue({ id: 17 }) } as never,
        {} as never,
      ),
      tx,
    };
  }

  it('writes validated bytes with an opaque key and persists checksum metadata', async () => {
    const { service, tx } = makeService();
    const buffer = Buffer.from('89504e470d0a1a0a0000', 'hex');

    const result = await service.store(
      'emp-photo',
      {
        buffer,
        size: buffer.length,
        mimetype: 'application/octet-stream',
        originalname: '../../avatar.exe',
      } as Express.Multer.File,
      { sub: 7, branch: 3 } as never,
      17,
    );

    expect(result).toMatchObject({
      id: expect.any(String),
      path: expect.stringMatching(/^file:/),
      url: expect.stringMatching(/^\/api\/uploads\/files\//),
    });
    const data = tx.private_file_metadata.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      category: 'emp-photo',
      original_name: 'avatar.exe',
      mime_type: 'image/png',
      owner_employee_id: 17,
      branch_id: 3,
      uploaded_by: 7,
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(await readFile(join(root, data.storage_key))).toEqual(buffer);
  });

  it('rejects MIME spoofing before creating a file or metadata row', async () => {
    const { service, tx } = makeService();

    await expect(
      service.store(
        'document',
        {
          buffer: Buffer.from('MZ executable'),
          size: 13,
          mimetype: 'application/pdf',
          originalname: 'safe.pdf',
        } as Express.Multer.File,
        { sub: 7, branch: 3 } as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.private_file_metadata.create).not.toHaveBeenCalled();
  });

  it('stores a member profile photo as opaque public media for the token branch', async () => {
    const tx = {
      private_file_metadata: { create: jest.fn() },
      business_audit_log: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (db: typeof tx) => unknown) => fn(tx)),
      employees: { count: jest.fn() },
    };
    const service = new UploadsService(
      prisma as never,
      {
        get: (key: string) => (key === 'privateUploadDir' ? root : undefined),
      } as never,
      {} as never,
      {} as never,
      new One80FileCategoryAdapter(),
    );
    const buffer = Buffer.from('89504e470d0a1a0a0000', 'hex');

    const result = await service.storeMemberProfile(
      {
        buffer,
        size: buffer.length,
        mimetype: 'image/png',
        originalname: 'avatar.png',
      } as Express.Multer.File,
      { sub: 71, memberId: 46, branchId: 2 } as never,
    );

    expect(result.path).toMatch(/^public-file:/);
    expect(result.url).toMatch(/^\/api\/uploads\/public\//);
    expect(tx.private_file_metadata.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        category: 'member-profile',
        branch_id: 2,
        uploaded_by: 71,
        mime_type: 'image/png',
      }),
    });
  });
});
