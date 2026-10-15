export const FILE_CATEGORY_ADAPTER = Symbol('FILE_CATEGORY_ADAPTER');

export type DetectedFileKind =
  | 'jpeg'
  | 'png'
  | 'gif'
  | 'webp'
  | 'pdf'
  | 'office'
  | 'office-zip';

export interface FileCategoryPolicy {
  maxBytes: number;
  allowedKinds: ReadonlySet<DetectedFileKind>;
  uploadPermissions: readonly string[];
  downloadPermissions: readonly string[];
  publicMedia?: boolean;
  employeeOwner?: boolean;
}

export interface FileCategoryAdapter {
  policy(category: string): FileCategoryPolicy | null;
}

const IMAGE = new Set<DetectedFileKind>(['jpeg', 'png', 'gif', 'webp']);
const IMAGE_PDF = new Set<DetectedFileKind>([...IMAGE, 'pdf']);
const DOCUMENT = new Set<DetectedFileKind>([...IMAGE_PDF, 'office', 'office-zip']);

const HR_FILE_POLICIES: Record<string, FileCategoryPolicy> = {
  'emp-photo': { maxBytes: 5 * 1024 * 1024, allowedKinds: IMAGE, uploadPermissions: ['employees.list:create', 'employees.list:update'], downloadPermissions: ['employees.list:view'], employeeOwner: true },
  'emp-bank': { maxBytes: 10 * 1024 * 1024, allowedKinds: IMAGE_PDF, uploadPermissions: ['employees.list:create', 'employees.list:update'], downloadPermissions: ['employees.list:view'], employeeOwner: true },
  signature: { maxBytes: 2 * 1024 * 1024, allowedKinds: new Set(['jpeg', 'png', 'webp']), uploadPermissions: ['employees.list:create', 'employees.list:update'], downloadPermissions: ['employees.list:view'], employeeOwner: true },
  document: { maxBytes: 20 * 1024 * 1024, allowedKinds: DOCUMENT, uploadPermissions: ['employees.list:create', 'employees.list:update'], downloadPermissions: ['employees.list:view'], employeeOwner: true },
  activity: { maxBytes: 10 * 1024 * 1024, allowedKinds: IMAGE, uploadPermissions: ['affairs.activities:create', 'affairs.activities:update'], downloadPermissions: ['affairs.activities:view'], publicMedia: true },
  legal: { maxBytes: 25 * 1024 * 1024, allowedKinds: DOCUMENT, uploadPermissions: ['affairs.legal_files:create', 'affairs.legal_files:update'], downloadPermissions: ['affairs.legal_files:view'] },
  message: { maxBytes: 20 * 1024 * 1024, allowedKinds: DOCUMENT, uploadPermissions: ['affairs.messages:create', 'affairs.messages:update'], downloadPermissions: ['affairs.messages:view'] },
};

export class HrFileCategoryAdapter implements FileCategoryAdapter {
  policy(category: string): FileCategoryPolicy | null {
    return HR_FILE_POLICIES[category] ?? null;
  }
}
