import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UpsertClubEventSettingsDto } from './dto/upsert-club-event-settings.dto';
import { toNum } from './club-events.utils';

@Injectable()
export class ClubEventSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  private map(row: {
    id: number;
    refund_window_days: number;
    waitlist_hold_hours: number;
    approval_budget_threshold: unknown;
    reminder_hours_before: number;
    updated_by: number | null;
    updated_at: Date;
  }) {
    return {
      id: row.id,
      refundWindowDays: row.refund_window_days,
      waitlistHoldHours: row.waitlist_hold_hours,
      approvalBudgetThreshold:
        row.approval_budget_threshold != null ? toNum(row.approval_budget_threshold as never) : null,
      reminderHoursBefore: row.reminder_hours_before,
      updatedBy: row.updated_by,
      updatedAt: row.updated_at,
    };
  }

  /** Single typed settings row. Auto-creates with defaults on first read (no seed dependency). */
  async get() {
    let row = await this.prisma.club_event_settings.findFirst({ orderBy: { id: 'asc' } });
    if (!row) {
      row = await this.prisma.club_event_settings.create({ data: {} });
    }
    return this.map(row);
  }

  /** Upsert-style: creates the row on first write, updates it on subsequent writes. */
  async update(dto: UpsertClubEventSettingsDto, userId?: number) {
    const existing = await this.prisma.club_event_settings.findFirst({ orderBy: { id: 'asc' } });

    const data = {
      ...(dto.refundWindowDays != null ? { refund_window_days: dto.refundWindowDays } : {}),
      ...(dto.waitlistHoldHours != null ? { waitlist_hold_hours: dto.waitlistHoldHours } : {}),
      ...(dto.approvalBudgetThreshold !== undefined
        ? { approval_budget_threshold: dto.approvalBudgetThreshold }
        : {}),
      ...(dto.reminderHoursBefore != null ? { reminder_hours_before: dto.reminderHoursBefore } : {}),
      updated_by: userId ?? null,
    };

    const row = existing
      ? await this.prisma.club_event_settings.update({ where: { id: existing.id }, data })
      : await this.prisma.club_event_settings.create({ data });

    return this.map(row);
  }
}
