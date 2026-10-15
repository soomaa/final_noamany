import { Injectable, NotFoundException } from '@nestjs/common';
import { randomInt } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class GateCredentialService {
  constructor(private readonly prisma: PrismaService) {}

  private generateNumber(): string {
    // Seven decimal digits fit safely inside the 24-bit card-number payload of
    // Wiegand-26, while remaining easy for QR50BE to emit as a card number.
    return String(randomInt(1_000_000, 10_000_000));
  }

  async ensureForMember(memberId: number) {
    const existing = await this.prisma.gate_credentials.findUnique({
      where: { member_id: memberId },
    });
    if (existing) return existing;

    const member = await this.prisma.club_members.findFirst({
      where: { id: memberId, is_deleted: false },
      select: { id: true },
    });
    if (!member) throw new NotFoundException('العضو غير موجود');

    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        return await this.prisma.gate_credentials.create({
          data: { member_id: memberId, credential_no: this.generateNumber() },
        });
      } catch (error) {
        // Concurrent requests for the same member are harmless.
        const raced = await this.prisma.gate_credentials.findUnique({
          where: { member_id: memberId },
        });
        if (raced) return raced;
        if (attempt === 19) throw error;
      }
    }

    throw new Error('Unable to allocate a unique gate credential');
  }

  async findForEntryAlert(credentialNo: string) {
    const code = credentialNo.trim();
    if (!code) return null;
    const issued = await this.prisma.gate_credentials.findFirst({
      where: { credential_no: code },
      include: { member: { select: { id: true, branch_id: true, is_deleted: true } } },
    });
    if (issued) return issued.member.is_deleted ? null : issued;
    const member = await this.prisma.club_members.findFirst({
      where: { member_code: code, is_deleted: false }, select: { id: true, branch_id: true },
    });
    return member ? { member } : null;
  }

  async findActive(credentialNo: string) {
    const code = credentialNo.trim();
    if (!code) return null;
    const memberSelect = {
      id: true,
      member_code: true,
      name: true,
      branch_id: true,
      is_active: true,
      is_blocked: true,
      is_deleted: true,
    } as const;
    const issued = await this.prisma.gate_credentials.findFirst({
      where: { credential_no: code },
      include: { member: { select: memberSelect } },
    });
    if (issued) {
      const member = issued.member;
      return issued.is_active && member.is_active && !member.is_blocked && !member.is_deleted
        ? issued
        : null;
    }
    const member = await this.prisma.club_members.findFirst({
      where: {
        member_code: code,
        is_deleted: false,
        is_active: true,
        is_blocked: false,
      },
      select: {
        ...memberSelect,
        gate_credential: { select: { is_active: true } },
      },
    });
    if (!member || member.gate_credential?.is_active === false) return null;
    const { gate_credential: _credential, ...rest } = member;
    return { member: rest };
  }
}
