import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UpdateProcurementSettingsDto } from './dto/procurement-ext.dto';
import { getProcurementSettings, toNumber } from './procurement.utils';

@Injectable()
export class ProcurementSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  private map(row: Awaited<ReturnType<typeof getProcurementSettings>>) {
    return {
      id: row.id,
      branchId: row.branch_id,
      requireApproval: row.require_approval,
      approvalThreshold: toNumber(row.approval_threshold),
      maxOrderAmount: row.max_order_amount != null ? toNumber(row.max_order_amount) : null,
      requireVendorEvaluation: row.require_vendor_evaluation,
      minQuotations: row.min_quotations,
      enableInventoryIntegration: row.enable_inventory_integration,
      enableThreeWayMatch: row.enable_three_way_match,
      matchTolerancePercent: toNumber(row.match_tolerance_percent),
      notifyEmail: row.notify_email,
      notifySms: row.notify_sms,
      notifyInSystem: row.notify_in_system,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async get() {
    const row = await getProcurementSettings(this.prisma);
    return this.map(row);
  }

  async update(dto: UpdateProcurementSettingsDto) {
    const existing = await getProcurementSettings(this.prisma);
    const row = await this.prisma.prc_procurement_settings.update({
      where: { id: existing.id },
      data: {
        ...(dto.branchId !== undefined ? { branch_id: dto.branchId } : {}),
        ...(dto.requireApproval !== undefined ? { require_approval: dto.requireApproval } : {}),
        ...(dto.approvalThreshold !== undefined ? { approval_threshold: dto.approvalThreshold } : {}),
        ...(dto.maxOrderAmount !== undefined ? { max_order_amount: dto.maxOrderAmount } : {}),
        ...(dto.requireVendorEvaluation !== undefined
          ? { require_vendor_evaluation: dto.requireVendorEvaluation }
          : {}),
        ...(dto.minQuotations !== undefined ? { min_quotations: dto.minQuotations } : {}),
        ...(dto.enableInventoryIntegration !== undefined
          ? { enable_inventory_integration: dto.enableInventoryIntegration }
          : {}),
        ...(dto.enableThreeWayMatch !== undefined
          ? { enable_three_way_match: dto.enableThreeWayMatch }
          : {}),
        ...(dto.matchTolerancePercent !== undefined
          ? { match_tolerance_percent: dto.matchTolerancePercent }
          : {}),
        ...(dto.notifyEmail !== undefined ? { notify_email: dto.notifyEmail } : {}),
        ...(dto.notifySms !== undefined ? { notify_sms: dto.notifySms } : {}),
        ...(dto.notifyInSystem !== undefined ? { notify_in_system: dto.notifyInSystem } : {}),
      },
    });
    return this.map(row);
  }
}
