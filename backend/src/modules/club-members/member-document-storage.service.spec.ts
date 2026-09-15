import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { MemberDocumentStorageService } from './member-document-storage.service';

describe('MemberDocumentStorageService', () => {
  let root: string;

  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'noamany-member-doc-')); });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  function service(privateRoot = join(root, 'private'), publicRoot = join(root, 'uploads')) {
    return new MemberDocumentStorageService({
      get: (key: string) => key === 'privateMemberDocumentDir' ? privateRoot : publicRoot,
    } as never);
  }

  it('stores a verified PDF outside the public upload root with server-derived metadata', () => {
    const file = {
      buffer: Buffer.from('%PDF-1.7\nmember document'),
      mimetype: 'application/pdf',
      size: 24,
      originalname: '../../member\r\n.pdf',
    } as Express.Multer.File;

    const stored = service().store(file);

    expect(stored.storageKey).toMatch(/^member-document-[a-f0-9]{32}\.pdf$/);
    expect(stored).toMatchObject({
      originalFilename: 'member.pdf',
      mimeType: 'application/pdf',
      byteSize: file.buffer.length,
    });
    expect(stored.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(service().read(stored.storageKey).buffer).toEqual(file.buffer);
  });

  it('rejects a declared PDF whose bytes do not contain a PDF signature', () => {
    const file = {
      buffer: Buffer.from('<script>alert(1)</script>'),
      mimetype: 'application/pdf',
      size: 25,
      originalname: 'member.pdf',
    } as Express.Multer.File;

    expect(() => service().store(file)).toThrow('محتوى');
  });

  it('rejects traversal-shaped keys and refuses a private root under public uploads', () => {
    expect(() => service().read('../../member-document-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.pdf')).toThrow('غير موجود');

    const publicRoot = join(root, 'uploads');
    const unsafe = service(join(publicRoot, 'member-documents'), publicRoot);
    const file = {
      buffer: Buffer.from('%PDF-1.7\n'),
      mimetype: 'application/pdf',
      size: 9,
      originalname: 'member.pdf',
    } as Express.Multer.File;
    expect(() => unsafe.store(file)).toThrow('خارج مجلد الملفات العامة');
  });

  it('reads a legacy PDF only from the historic membership directory for guarded delivery', () => {
    const publicRoot = join(root, 'uploads');
    const legacyDir = join(publicRoot, 'club', 'membership-documents');
    mkdirSync(legacyDir, { recursive: true });
    writeFileSync(join(legacyDir, 'membership-20260909aaaaaaaaaaaaaaaa.pdf'), '%PDF-1.7\nlegacy');

    expect(service(join(root, 'private'), publicRoot).readLegacy(
      'club/membership-documents/membership-20260909aaaaaaaaaaaaaaaa.pdf',
    ).buffer).toEqual(Buffer.from('%PDF-1.7\nlegacy'));
    expect(() => service(join(root, 'private'), publicRoot).readLegacy(
      'club/membership-documents/../../secrets.pdf',
    )).toThrow('غير موجود');
  });
});
