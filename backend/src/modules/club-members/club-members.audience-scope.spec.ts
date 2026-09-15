import { BranchScopeService } from '../../common/branch-scope/branch-scope.service';
import { ClubMembersService } from './club-members.service';

describe('ClubMembersService audience authorization', () => {
  const prisma = {
    club_members: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    club_member_documents: {
      findMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
    club_receipts: { findMany: jest.fn() },
    club_locker_subscriptions: { findMany: jest.fn() },
    club_subscriptions: { findMany: jest.fn() },
    club_subscription_freezes: { findMany: jest.fn() },
  };
  const documentStorage = {
    store: jest.fn(),
    read: jest.fn(),
    readLegacy: jest.fn(),
    remove: jest.fn(),
  };
  const service = new ClubMembersService(
    prisma as never,
    {} as never,
    new BranchScopeService(),
    {} as never,
    documentStorage as never,
  );
  const menUser = { sub: 9, level: 3, branch: 5, man_women_type: 0 } as never;

  beforeEach(() => jest.clearAllMocks());

  it('rejects a membership-document read for a women member in the same branch', async () => {
    prisma.club_members.findUnique.mockResolvedValue({
      id: 4,
      branch_id: 5,
      gender: 'female',
      membership_document_path: '/uploads/membership-documents/member-4.pdf',
      membership_document_uploaded_at: new Date(),
    });

    await expect(service.getMembershipDocument(4, menUser)).rejects.toThrow(
      'لا تملك صلاحية الوصول لبيانات هذا القسم',
    );
  });

  it('keeps the legacy singular document read compatible without disclosing its public storage path', async () => {
    prisma.club_members.findUnique.mockResolvedValue({
      id: 4,
      branch_id: 5,
      gender: 'male',
      membership_document_path: '/uploads/membership-documents/member-4.pdf',
      membership_document_uploaded_at: new Date('2026-09-08T10:00:00.000Z'),
    });

    const result = await service.getMembershipDocument(4, menUser);

    expect(result).toEqual({
      available: true,
      uploadedAt: new Date('2026-09-08T10:00:00.000Z'),
      downloadUrl: '/club-members/4/membership-document/file',
    });
    expect(result).not.toHaveProperty('path');
  });

  it('authorizes the owning member before reading a guarded legacy document', async () => {
    prisma.club_members.findUnique.mockResolvedValue({
      id: 4,
      branch_id: 5,
      gender: 'male',
      membership_document_path: 'club/membership-documents/membership-20260909aaaaaaaaaaaaaaaa.pdf',
    });
    documentStorage.readLegacy.mockReturnValue({
      buffer: Buffer.from('%PDF-1.7\nlegacy'),
      originalFilename: 'membership-20260909aaaaaaaaaaaaaaaa.pdf',
      mimeType: 'application/pdf',
    });

    await expect(service.readLegacyMembershipDocument(4, menUser)).resolves.toMatchObject({
      originalFilename: 'membership-20260909aaaaaaaaaaaaaaaa.pdf',
    });
    expect(documentStorage.readLegacy).toHaveBeenCalledWith('club/membership-documents/membership-20260909aaaaaaaaaaaaaaaa.pdf');
  });

  it('builds the read-only barcode preview with the latest 10 subscriptions, locker and freeze records', async () => {
    prisma.club_members.findFirst.mockResolvedValue({ id: 4, branch_id: 5, gender: 'male', member_code: 'M-4', name: 'عضو', is_blocked: false, block_reason: null });
    prisma.club_receipts.findMany.mockResolvedValue([{ id: 1, receipt_number: 'R-1', amount: 100, receipt_date: '2026-09-01', payment_method: 'cash', created_at: new Date() }]);
    prisma.club_locker_subscriptions.findMany.mockResolvedValue([{ id: 2, subscription_number: 'L-1', subscription_start_date: '2026-09-01', subscription_end_date: '2026-10-01', status: 'active', locker: { locker_number: '10' }, type: { name: 'شهرى' } }]);
    prisma.club_subscriptions.findMany.mockResolvedValue([{
      id: 3,
      subscription_number: 'S-1',
      subscription_type: 'جيم',
      registration_date: '2026-09-01',
      subscription_start_date: '2026-09-01',
      subscription_end_date: '2026-10-01',
      status: 'active',
      subscription_value: 500,
      paid_amount: 400,
      remaining_amount: 100,
    }]);
    prisma.club_subscription_freezes.findMany.mockResolvedValue([{ subscription_id: 3, freeze_start_date: '2026-09-02', freeze_end_date: '2026-09-04', actual_days: 2, is_active: false }]);

    await expect(service.barcodePreview('M-4', menUser)).resolves.toMatchObject({
      member: { id: 4, memberCode: 'M-4' },
      latestSubscriptions: [{ subscriptionNumber: 'S-1', remainingAmount: 100 }],
      transactions: [{ receiptNumber: 'R-1' }],
      lockerSubscriptions: [{ lockerNumber: '10' }],
      freezes: [{ days: 2 }],
    });
    expect(prisma.club_subscriptions.findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 10,
      orderBy: [{ registration_date: 'desc' }, { id: 'desc' }],
    }));
    expect(prisma.club_members.update).not.toHaveBeenCalled();
    expect(prisma.club_member_documents.create).not.toHaveBeenCalled();
  });

  it('records only server-derived metadata and never returns a private storage path', async () => {
    prisma.club_members.findUnique.mockResolvedValue({ id: 4, branch_id: 5, gender: 'male' });
    documentStorage.store.mockReturnValue({
      storageKey: 'member-document-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.pdf',
      originalFilename: 'id.pdf',
      mimeType: 'application/pdf',
      byteSize: 1200,
      sha256: 'b'.repeat(64),
    });
    prisma.club_member_documents.create.mockResolvedValue({
      id: 8,
      member_id: 4,
      document_type: 'national_id',
      label: 'وجه البطاقة',
      storage_path: 'member-document-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.pdf',
      original_filename: 'id.pdf',
      mime_type: 'application/pdf',
      byte_size: 1200,
      sha256: 'b'.repeat(64),
      uploaded_at: new Date('2026-09-09T10:00:00.000Z'),
    });

    const result = await service.uploadMembershipDocument(
      4,
      'national-id',
      'وجه البطاقة',
      { buffer: Buffer.from('%PDF-'), mimetype: 'application/pdf' } as Express.Multer.File,
      menUser,
    );

    expect(result).toMatchObject({
      id: 8,
      type: 'national_id',
      originalFilename: 'id.pdf',
      byteSize: 1200,
      downloadUrl: '/club-members/4/membership-documents/8/file',
    });
    expect(result).not.toHaveProperty('path');
    expect(result).not.toHaveProperty('sha256');
    expect(prisma.club_member_documents.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        storage_path: 'member-document-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.pdf',
        original_filename: 'id.pdf',
        byte_size: 1200,
        sha256: 'b'.repeat(64),
      }),
    });
  });

  it('authorizes the owning member before opening a private document blob', async () => {
    prisma.club_members.findUnique.mockResolvedValue({ id: 4, branch_id: 5, gender: 'female' });
    prisma.club_member_documents.findFirst.mockResolvedValue({
      id: 8,
      member_id: 4,
      storage_path: 'member-document-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.pdf',
      original_filename: 'id.pdf',
      mime_type: 'application/pdf',
    });

    await expect(service.readMembershipDocument(4, 8, menUser)).rejects.toThrow('القسم');
    expect(documentStorage.read).not.toHaveBeenCalled();
  });
});
