import { BadRequestException } from '@nestjs/common';
import { InvitationPhonePolicyService } from './invitation-phone-policy.service';

describe('InvitationPhonePolicyService', () => {
  function setup(allowRepeats = false, legacyRows: Array<{ id: number; recipient_phone: string | null }> = []) {
    const prisma = {
      club_gym_policies: {
        findUnique: jest.fn().mockResolvedValue({
          allow_same_guest_multiple_invitations: allowRepeats,
        }),
      },
      am_invitations: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue(legacyRows),
      },
    };
    return {
      service: new InvitationPhonePolicyService(prisma as never),
      prisma,
    };
  }

  it('normalizes Arabic digits while preserving the local leading zero', async () => {
    const { service } = setup();

    await expect(service.prepare('٠١٠ ١٢٣-٤٥٦٧٨')).resolves.toEqual({
      phone: '01012345678',
      uniqueKey: '01012345678',
    });
  });

  it('treats international 00 and plus prefixes as the same guest identity', async () => {
    const { service } = setup(false, [{ id: 3, recipient_phone: '0020 10 1234 5678' }]);

    await expect(service.prepare('+20 10 1234 5678')).rejects.toEqual(
      expect.objectContaining<Partial<BadRequestException>>({
        message: 'هذا الضيف استخدم دعوة سابقًا — غير مسموح بتكرار نفس الرقم',
      }),
    );
  });

  it('uses a null unique key only when repeated guest invitations are allowed', async () => {
    const { service, prisma } = setup(true);

    await expect(service.prepare('01012345678')).resolves.toEqual({
      phone: '01012345678',
      uniqueKey: null,
    });
    expect(prisma.am_invitations.findFirst).not.toHaveBeenCalled();
    expect(prisma.am_invitations.findMany).not.toHaveBeenCalled();
  });

  it('recognizes the database race-protection constraint', () => {
    const { service } = setup();
    expect(service.isPhoneUniqueViolation({
      code: 'P2002',
      meta: { target: ['recipient_phone_unique_key'] },
    })).toBe(true);
  });
});

