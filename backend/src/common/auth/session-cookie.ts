function configuredCookieName(envKey: string, fallback: string): string {
  const value = process.env[envKey]?.trim();
  return value && /^[A-Za-z0-9_-]{1,64}$/.test(value) ? value : fallback;
}

export const ACCESS_COOKIE = configuredCookieName('HR_ACCESS_COOKIE_NAME', 'hr_access');
export const REFRESH_COOKIE = configuredCookieName('HR_REFRESH_COOKIE_NAME', 'hr_refresh');
