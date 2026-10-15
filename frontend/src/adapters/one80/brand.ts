import { registerBrandProfile } from '@/ports/brand-registry';

export function installOne80Brand(): void {
  registerBrandProfile({
    name: 'ONE80',
    tagline: 'GYM & FITNESS HUB',
    mark: '80',
    logoSrc: '/one-logo.png',
    opaqueLogoSrc: '/one-logo.jpeg',
  });
}
