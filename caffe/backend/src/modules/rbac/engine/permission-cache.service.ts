import { Injectable } from '@nestjs/common';

export interface EffectiveResult {
  superAdmin: boolean;
  /** Flat set of allowed permission keys `${resourceKey}:${actionKey}`. */
  keys: Set<string>;
  /** resourceKey -> data scope (broadest across roles). Empty unless scopes are configured. */
  scope: Map<string, string>;
}

interface Entry {
  result: EffectiveResult;
  exp: number;
}

/**
 * Short-TTL in-memory cache of each user's resolved permission set.
 * TTL ~2 minutes (per spec); invalidated explicitly on role/exception/assignment changes.
 *
 * NOTE: single-process cache. If the API is ever horizontally scaled, swap this for Redis —
 * the interface (get/set/invalidate*) stays the same.
 */
@Injectable()
export class PermissionCacheService {
  private readonly ttlMs = 120_000;
  private readonly store = new Map<number, Entry>();

  get(userId: number): EffectiveResult | undefined {
    const e = this.store.get(userId);
    if (!e) return undefined;
    if (e.exp < this.now()) {
      this.store.delete(userId);
      return undefined;
    }
    return e.result;
  }

  set(userId: number, result: EffectiveResult): void {
    this.store.set(userId, { result, exp: this.now() + this.ttlMs });
  }

  invalidateUser(userId: number): void {
    this.store.delete(userId);
  }

  invalidateUsers(userIds: Iterable<number>): void {
    for (const id of userIds) this.store.delete(id);
  }

  invalidateAll(): void {
    this.store.clear();
  }

  private now(): number {
    return Date.now();
  }
}
