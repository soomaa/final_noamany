import { equipmentUploadPath, exerciseEquipmentIds } from './equipment-media';

export interface EquipmentRow {
  id: number;
  name: string;
  image_url: string | null;
  branch_id: number;
  category: string | null;
}
/** Equipment as stored on exercises, plan entries and session entries. */
export interface TrainingEquipment {
  id: number;
  name: string;
  /** Stored reference (`/uploads/club/equipment/<file>` or https URL); the web app resolves it itself. */
  imageUrl: string | null;
  /** Servable URL for the mobile apps: `/uploads/club/equipment/<file>` (relative to the API origin) or https. */
  photoUrl: string | null;
  branchId: number;
  category: string | null;
}

/** Noamany serves uploads statically under `/uploads`; external photos must be https. */
export function equipmentPhotoUrl(reference: string | null | undefined): string | null {
  const value = reference?.trim();
  if (!value) return null;
  if (value.startsWith('https://')) return value;
  const path = equipmentUploadPath(value);
  return path ? `/uploads/${path}` : null;
}

const nameKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLocaleLowerCase();

/**
 * `club_equipment` is a per-branch asset register, so one machine type can have
 * several rows (one per serial number). Training treats every (branch, name) as a
 * single library item: the row with a photo wins, then the lowest id.
 */
export class EquipmentLibrary {
  readonly items: TrainingEquipment[];
  private readonly byId = new Map<number, TrainingEquipment>();
  private readonly byBranchName = new Map<string, TrainingEquipment>();

  constructor(rows: EquipmentRow[]) {
    const groups = new Map<string, EquipmentRow[]>();
    for (const row of rows) {
      const key = `${row.branch_id}:${nameKey(row.name)}`;
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    for (const [key, group] of groups) {
      const rep = [...group].sort((a, b) => Number(!a.image_url) - Number(!b.image_url) || a.id - b.id)[0];
      const item: TrainingEquipment = {
        id: rep.id,
        name: rep.name.trim(),
        imageUrl: rep.image_url,
        photoUrl: equipmentPhotoUrl(rep.image_url),
        branchId: rep.branch_id,
        category: rep.category ?? group.find(r => r.category)?.category ?? null,
      };
      this.byBranchName.set(key, item);
      for (const row of group) this.byId.set(row.id, item);
    }
    this.items = [...this.byBranchName.values()].sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  }

  resolve(id: number): TrainingEquipment | undefined {
    return this.byId.get(id);
  }

  /** The library item with this name in `branchId`, if the branch has one. */
  inBranch(name: string, branchId: number): TrainingEquipment | undefined {
    return this.byBranchName.get(`${branchId}:${nameKey(name)}`);
  }

  /** Exercise defaults are club-wide; resolve each to its active row, deduped by name. */
  forExercise(rawIds: unknown): TrainingEquipment[] {
    const result = new Map<string, TrainingEquipment>();
    for (const id of exerciseEquipmentIds(rawIds)) {
      const item = this.resolve(id);
      if (item && !result.has(nameKey(item.name))) result.set(nameKey(item.name), item);
    }
    return [...result.values()];
  }

  /**
   * Maps equipment onto a plan's branch: the same row when it already belongs to
   * the branch, else the branch's machine with the same name. Equipment the
   * branch does not have (or that was retired) is dropped.
   */
  forBranch(items: Array<{ id: number; name?: string }>, branchId: number): TrainingEquipment[] {
    const result = new Map<number, TrainingEquipment>();
    for (const item of items) {
      const current = this.resolve(item.id);
      const name = current?.name ?? item.name;
      const match = current?.branchId === branchId ? current : name ? this.inBranch(name, branchId) : undefined;
      if (match) result.set(match.id, match);
    }
    return [...result.values()].slice(0, 10);
  }

  /** Current photo for an equipment snapshot; keeps the snapshot name the coach saw. */
  refresh<T extends { id: number; imageUrl?: string | null }>(item: T): T & { photoUrl: string | null } {
    const current = this.resolve(item.id);
    const imageUrl = current ? current.imageUrl : item.imageUrl ?? null;
    return { ...item, imageUrl, photoUrl: equipmentPhotoUrl(imageUrl) };
  }
}

type WithEquipment = { equipment?: Array<{ id: number; imageUrl?: string | null }> };

/** Adds `photoUrl` to the equipment inside assignment snapshots and session entries. */
export function withEquipmentPhotos<T>(rows: T[], field: 'entries' | 'snapshot', library: EquipmentLibrary): T[] {
  const mapExercise = (e: unknown) => {
    const row = e as WithEquipment;
    return row && Array.isArray(row.equipment) ? { ...row, equipment: row.equipment.map(item => library.refresh(item)) } : e;
  };
  return rows.map(row => {
    const value = (row as Record<string, unknown>)[field];
    if (field === 'entries' && Array.isArray(value)) return { ...row, entries: value.map(mapExercise) };
    if (field === 'snapshot' && value && typeof value === 'object') {
      const snapshot = value as { days?: Array<{ exercises?: unknown[]; warmup?: unknown }> };
      if (!Array.isArray(snapshot.days)) return row;
      const mapWarmup = (warmup: unknown) => {
        const w = warmup as { equipmentItems?: Array<{ id: number; imageUrl?: string | null }> } | undefined;
        return w && Array.isArray(w.equipmentItems) ? { ...w, equipmentItems: w.equipmentItems.map(item => library.refresh(item)) } : warmup;
      };
      return { ...row, snapshot: { ...snapshot, days: snapshot.days.map(day => ({
        ...day,
        ...(Array.isArray(day.exercises) ? { exercises: day.exercises.map(mapExercise) } : {}),
        ...('warmup' in day ? { warmup: mapWarmup((day as { warmup?: unknown }).warmup) } : {}),
      })) } };
    }
    return row;
  });
}
