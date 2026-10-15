import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { hashRefreshToken, isSessionUsable } from './staff-session.policy';

export interface SessionContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface CreateStaffSessionInput extends SessionContext {
  id: string;
  familyId: string;
  userId: number;
  refreshToken: string;
  expiresAt: Date;
}

export interface RotateStaffSessionInput extends SessionContext {
  currentSessionId: string;
  familyId: string;
  userId: number;
  currentRefreshToken: string;
  successor: {
    id: string;
    refreshToken: string;
    expiresAt: Date;
  };
  now?: Date;
}

type SessionMutationClient = Pick<Prisma.TransactionClient, 'staff_auth_sessions'>;

@Injectable()
export class StaffSessionService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateStaffSessionInput): Promise<void> {
    await this.prisma.staff_auth_sessions.create({
      data: this.createData(input),
    });
  }

  async rotate(input: RotateStaffSessionInput): Promise<void> {
    const now = input.now ?? new Date();
    const rotated = await this.prisma.$transaction(async (tx) => {
      const current = await tx.staff_auth_sessions.findUnique({
        where: { id: input.currentSessionId },
      });
      const valid =
        current != null &&
        isSessionUsable(
          {
            userId: current.user_id,
            familyId: current.family_id,
            tokenHash: current.refresh_token_hash,
            expiresAt: current.expires_at,
            consumedAt: current.consumed_at,
            revokedAt: current.revoked_at,
          },
          {
            userId: input.userId,
            familyId: input.familyId,
            token: input.currentRefreshToken,
            now,
          },
        );

      if (!valid) {
        if (current?.user_id === input.userId && current.family_id === input.familyId) {
          await tx.staff_auth_sessions.updateMany({
            where: { family_id: current.family_id, revoked_at: null },
            data: { revoked_at: now, revocation_reason: 'refresh_token_replay' },
          });
        }
        return false;
      }

      const consumed = await tx.staff_auth_sessions.updateMany({
        where: {
          id: current.id,
          user_id: input.userId,
          consumed_at: null,
          revoked_at: null,
          expires_at: { gt: now },
        },
        data: {
          consumed_at: now,
          last_used_at: now,
          replaced_by: input.successor.id,
        },
      });
      if (consumed.count !== 1) {
        await tx.staff_auth_sessions.updateMany({
          where: { family_id: current.family_id, revoked_at: null },
          data: { revoked_at: now, revocation_reason: 'refresh_token_replay' },
        });
        return false;
      }

      await tx.staff_auth_sessions.create({
        data: this.createData({
          id: input.successor.id,
          familyId: current.family_id,
          userId: input.userId,
          refreshToken: input.successor.refreshToken,
          expiresAt: input.successor.expiresAt,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
        }),
      });
      return true;
    });

    if (!rotated) throw new UnauthorizedException('انتهت الجلسة');
  }

  async assertAccessSession(userId: number, sessionId: string, now = new Date()): Promise<void> {
    const session = await this.prisma.staff_auth_sessions.findFirst({
      where: {
        id: sessionId,
        user_id: userId,
        consumed_at: null,
        revoked_at: null,
        expires_at: { gt: now },
      },
      select: { id: true },
    });
    if (!session) throw new UnauthorizedException('انتهت الجلسة');
  }

  async revokeFamily(
    userId: number,
    sessionId: string,
    reason: string,
    client: SessionMutationClient = this.prisma,
  ): Promise<void> {
    const session = await client.staff_auth_sessions.findFirst({
      where: { id: sessionId, user_id: userId },
      select: { family_id: true },
    });
    if (!session) return;
    await client.staff_auth_sessions.updateMany({
      where: { family_id: session.family_id, user_id: userId, revoked_at: null },
      data: { revoked_at: new Date(), revocation_reason: reason },
    });
  }

  async revokeAllForUser(
    userId: number,
    reason: string,
    client: SessionMutationClient = this.prisma,
  ): Promise<void> {
    await client.staff_auth_sessions.updateMany({
      where: { user_id: userId, revoked_at: null },
      data: { revoked_at: new Date(), revocation_reason: reason },
    });
  }

  private createData(input: CreateStaffSessionInput) {
    return {
      id: input.id,
      family_id: input.familyId,
      user_id: input.userId,
      refresh_token_hash: hashRefreshToken(input.refreshToken),
      expires_at: input.expiresAt,
      ip_address: input.ipAddress?.slice(0, 45) || null,
      user_agent: input.userAgent?.slice(0, 255) || null,
    };
  }
}
