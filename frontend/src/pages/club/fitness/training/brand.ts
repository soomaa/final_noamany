/** Noamany branding for the printable training sheets (single-tenant replacement of Gymora's tenant-brand). */
export function getBrandName() {
  return 'Noamany Fitness Center';
}
export function getBrandLogo() {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return `${origin}/noamany-logo.png`;
}
