import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { OnlineProofStorageService } from './online-proof-storage.service';

describe('OnlineProofStorageService', () => {
  let root: string;

  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'noamany-proof-')); });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('rejects traversal-shaped storage keys even when their basename exists', () => {
    const name = 'proof-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png';
    writeFileSync(join(root, name), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const service = new OnlineProofStorageService({
      get: (key: string) => key === 'privateOnlineProofDir' ? root : join(root, 'public-uploads'),
    } as any);

    expect(() => service.read(`../../${name}`)).toThrow('غير موجود');
  });

  it('refuses a private proof directory nested under the public uploads directory', () => {
    const publicRoot = join(root, 'uploads');
    const service = new OnlineProofStorageService({
      get: (key: string) => key === 'privateOnlineProofDir' ? join(publicRoot, 'proofs') : publicRoot,
    } as any);
    const file = {
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      mimetype: 'image/png',
      size: 8,
    } as Express.Multer.File;

    expect(() => service.store(file)).toThrow('مجلد إثباتات الدفع');
  });
});
