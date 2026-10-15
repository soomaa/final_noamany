const overlays: Record<string, string>[] = [];
let mergedMaps = new WeakMap<Record<string, string>, Record<string, string>>();

export function registerUiTranslationMap(map: Record<string, string>): void {
  overlays.push(map);
  // Registrations are rare; lookups run for every label on every render.
  mergedMaps = new WeakMap();
}

export function uiTranslationMap(base: Record<string, string>): Record<string, string> {
  const cached = mergedMaps.get(base);
  if (cached) return cached;
  const merged: Record<string, string> = Object.assign({}, base, ...overlays);
  mergedMaps.set(base, merged);
  return merged;
}
