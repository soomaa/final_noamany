import { JwtUser } from '../types/jwt-user';
import { isSystemAdmin } from './system-admin.util';

export function isReceptionEmployee(user?: JwtUser): boolean {
  if (!user || isSystemAdmin(user) || user.level === 3) return false;
  const title = user.job_title?.normalize('NFKD').toLowerCase() ?? '';
  return /(استقبال|ريسيبشن|ريسبشن|reception)/i.test(title)
    && !/(مدير|مشرف|رئيس|manager|supervisor|head)/i.test(title);
}
