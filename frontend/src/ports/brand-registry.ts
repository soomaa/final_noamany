export interface BrandProfile {
  name: string;
  tagline: string;
  mark: string;
  logoSrc: string | null;
  opaqueLogoSrc: string | null;
}

let profile: BrandProfile = {
  name: 'HR',
  tagline: 'HUMAN RESOURCES',
  mark: 'HR',
  logoSrc: null,
  opaqueLogoSrc: null,
};

export function registerBrandProfile(next: BrandProfile): void {
  profile = { ...next };
}

export function getBrandProfile(): BrandProfile {
  return profile;
}
