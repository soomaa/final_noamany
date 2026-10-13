import { ClubMembersService } from './club-members.service';
import { MemberDocumentStorageService } from './member-document-storage.service';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('migrated member attachments', () => {
  const prisma = {
    club_members: { findUnique: jest.fn() },
    club_member_documents: { findMany: jest.fn() },
    club_member_images: { findMany: jest.fn(), findFirst: jest.fn() },
  };
  const storage = { migratedAttachmentInfo: jest.fn(), readMigratedAttachment: jest.fn() };
  const service = new ClubMembersService(prisma as never, {} as never, {} as never, {} as never, storage as never);
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.club_members.findUnique.mockResolvedValue({ id: 5, branch_id: 2 });
    jest.spyOn(service as any, 'assertMemberAccess').mockImplementation(() => undefined);
  });
  it('lists both sources with distinct IDs and authenticated download URLs', async () => {
    prisma.club_member_documents.findMany.mockResolvedValue([{ id: 8, member_id: 5 }]);
    prisma.club_member_images.findMany.mockResolvedValue([{ id: 8, image_path: 'member_attaches/card.jpg', created_at: new Date() }]);
    storage.migratedAttachmentInfo.mockReturnValue({ originalFilename: 'card.jpg', mimeType: 'image/jpeg' });
    const result = await service.listMembershipDocuments(5);
    expect(result.map((r) => r.id)).toEqual([8, -8]);
    expect(result[1].downloadUrl).toBe('/club-members/5/membership-documents/-8/file');
    expect(prisma.club_member_images.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { member_id: 5, image_path: { not: null } } }));
  });
  it('cannot open another member attachment', async () => {
    prisma.club_member_images.findFirst.mockResolvedValue(null);
    await expect(service.readMembershipDocument(5, -8)).rejects.toThrow();
    expect(prisma.club_member_images.findFirst).toHaveBeenCalledWith({ where: { id: 8, member_id: 5 } });
    expect(storage.readMigratedAttachment).not.toHaveBeenCalled();
  });
  it('checks member access before reading legacy files', async () => {
    jest.spyOn(service as any, 'assertMemberAccess').mockImplementation(() => { throw new Error('denied'); });
    await expect(service.readMembershipDocument(5, -8)).rejects.toThrow('denied');
    expect(prisma.club_member_images.findFirst).not.toHaveBeenCalled();
  });
});

describe('migrated attachment storage', () => {
  let root: string;
  let storage: MemberDocumentStorageService;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'member-attachment-'));
    mkdirSync(join(root, 'member_attaches'));
    storage = new MemberDocumentStorageService({ get: () => root } as never);
    writeFileSync(join(root, 'member_attaches', 'card.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0x01]));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));
  it('opens normalized and bare historical filenames', () => {
    expect(storage.readMigratedAttachment('card.jpg').mimeType).toBe('image/jpeg');
    expect(storage.readMigratedAttachment('/uploads/member_attaches/card.jpg').originalFilename).toBe('card.jpg');
  });
  it.each(['../card.jpg', 'member_attaches/%2e%2e/card.jpg', 'https://other.example/card.jpg', 'employees/card.jpg'])('rejects unsafe paths: %s', (value) => {
    expect(() => storage.readMigratedAttachment(value)).toThrow();
  });
  it('rejects active content disguised as a photo', () => {
    writeFileSync(join(root, 'member_attaches', 'fake.jpg'), '<html>test</html>');
    expect(() => storage.readMigratedAttachment('fake.jpg')).toThrow();
  });
});
