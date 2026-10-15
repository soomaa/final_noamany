import { Injectable } from '@nestjs/common';
import {
  DetectedFileKind,
  FileCategoryAdapter,
  FileCategoryPolicy,
  HrFileCategoryAdapter,
} from '../../../ports/files/file-category.adapter';

const IMAGE = new Set<DetectedFileKind>(['jpeg', 'png', 'gif', 'webp']);
const IMAGE_PDF = new Set<DetectedFileKind>([...IMAGE, 'pdf']);

const ONE80_POLICIES: Record<string, FileCategoryPolicy> = {
  'equipment-image': { maxBytes: 5 * 1024 * 1024, allowedKinds: new Set(['jpeg', 'png', 'webp']), uploadPermissions: ['club.fitness.equipment:create', 'club.fitness.equipment:update'], downloadPermissions: ['club.fitness.equipment:view'], publicMedia: true },
  logo: { maxBytes: 5 * 1024 * 1024, allowedKinds: IMAGE, uploadPermissions: ['admin.company:update'], downloadPermissions: ['admin.company:view', 'admin.company:update'], publicMedia: true },
  'member-profile': { maxBytes: 5 * 1024 * 1024, allowedKinds: new Set(['jpeg', 'png', 'webp']), uploadPermissions: ['club.members:update'], downloadPermissions: ['club.members:view'], publicMedia: true },
  'club-member': { maxBytes: 5 * 1024 * 1024, allowedKinds: new Set(['jpeg', 'png', 'webp']), uploadPermissions: ['club.members:create', 'club.members:update'], downloadPermissions: ['club.members:view'], publicMedia: true },
  'product-image': { maxBytes: 5 * 1024 * 1024, allowedKinds: new Set(['jpeg', 'png', 'webp']), uploadPermissions: ['club.cafe.products:create', 'club.cafe.products:update', 'gym-sales.inventory.raw_materials:create', 'gym-sales.inventory.raw_materials:update'], downloadPermissions: ['club.cafe.products:view', 'gym-sales.inventory.raw_materials:view'], publicMedia: true },
  'club-package-promo': { maxBytes: 5 * 1024 * 1024, allowedKinds: new Set(['jpeg', 'png', 'webp']), uploadPermissions: ['club.packages.settings:create', 'club.packages.settings:update'], downloadPermissions: ['club.packages.settings:view'], publicMedia: true },
  'club-package-category': { maxBytes: 3 * 1024 * 1024, allowedKinds: new Set(['jpeg', 'png', 'webp']), uploadPermissions: ['club.packages.settings:create', 'club.packages.settings:update'], downloadPermissions: ['club.packages.settings:view'], publicMedia: true },
  'storage-doc': { maxBytes: 10 * 1024 * 1024, allowedKinds: IMAGE_PDF, uploadPermissions: ['gym-sales.inventory.raw_materials:create', 'gym-sales.inventory.raw_materials:update'], downloadPermissions: ['gym-sales.inventory.raw_materials:view'] },
  inbody: { maxBytes: 15 * 1024 * 1024, allowedKinds: IMAGE_PDF, uploadPermissions: ['club.fitness.inbody_invoices:create', 'club.fitness.inbody_invoices:update'], downloadPermissions: ['club.fitness.inbody_invoices:view'] },
  'procurement-doc': { maxBytes: 10 * 1024 * 1024, allowedKinds: IMAGE_PDF, uploadPermissions: ['gym-sales.procurement.cafe_purchases:create', 'gym-sales.procurement.cafe_purchases:update'], downloadPermissions: ['gym-sales.procurement.cafe_purchases:view'] },
  agent: { maxBytes: 5 * 1024 * 1024, allowedKinds: IMAGE, uploadPermissions: ['admin.agents:create', 'admin.agents:update'], downloadPermissions: ['admin.agents:view'] },
  app: { maxBytes: 10 * 1024 * 1024, allowedKinds: IMAGE, uploadPermissions: ['app-management.offers:create', 'app-management.offers:update'], downloadPermissions: ['app-management.offers:view'], publicMedia: true },
  event: { maxBytes: 10 * 1024 * 1024, allowedKinds: IMAGE, uploadPermissions: ['club.events.list:create', 'club.events.list:update'], downloadPermissions: ['club.events.list:view'], publicMedia: true },
  // Member-app media: trainer portraits and branch cover/gallery photos render for members and
  // guests without a staff session, so both are public image-only categories.
  trainers: { maxBytes: 5 * 1024 * 1024, allowedKinds: new Set(['jpeg', 'png', 'webp']), uploadPermissions: ['club.fitness.trainers:create', 'club.fitness.trainers:update', 'app-management.trainers:create', 'app-management.trainers:update'], downloadPermissions: ['club.fitness.trainers:view', 'app-management.trainers:view'], publicMedia: true },
  'branch-photo': { maxBytes: 10 * 1024 * 1024, allowedKinds: new Set(['jpeg', 'png', 'webp']), uploadPermissions: ['app-management.branches:update'], downloadPermissions: ['app-management.branches:view'], publicMedia: true },
  'event-consent': { maxBytes: 10 * 1024 * 1024, allowedKinds: IMAGE_PDF, uploadPermissions: ['club.events.registrations:create', 'club.events.registrations:update'], downloadPermissions: ['club.events.registrations:view'] },
};

@Injectable()
export class One80FileCategoryAdapter implements FileCategoryAdapter {
  private readonly hr = new HrFileCategoryAdapter();

  policy(category: string): FileCategoryPolicy | null {
    return this.hr.policy(category) ?? ONE80_POLICIES[category] ?? null;
  }
}
