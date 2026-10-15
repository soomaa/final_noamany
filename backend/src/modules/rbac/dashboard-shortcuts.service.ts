import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { buildRouteMap } from './catalog/rbac.catalog';
import { EffectiveResult } from './engine/permission-cache.service';
import { PermissionEngineService } from './engine/permission-engine.service';

const DEFAULT_ROUTES = ['/club/subscriptions/daily-cashier', '/finance/expenses', '/finance/profit-loss'];

@Injectable()
export class DashboardShortcutsService {
  private readonly routeMap = buildRouteMap();
  constructor(private readonly prisma: PrismaService, private readonly permissions: PermissionEngineService) {}

  private allowed(route: string, effective: EffectiveResult) {
    const resource = Object.prototype.hasOwnProperty.call(this.routeMap, route) ? this.routeMap[route] : undefined;
    if (!resource || route === '/dashboard') return false;
    if (effective.superAdmin || effective.keys.has(`${resource}:view`)) return true;
    return route === '/finance/dashboard' && ['reports', 'revenue_reports', 'analysis', 'profit_loss']
      .some((key) => effective.keys.has(`financial-reports.${key}:view`));
  }

  async get(userId: number) {
    const [user, effective] = await Promise.all([
      this.prisma.users.findUnique({ where: { user_id: userId }, select: { dashboard_shortcuts: true } }),
      this.permissions.getEffective(userId),
    ]);
    if (!user) throw new NotFoundException('الحساب غير موجود');
    const routes = Array.isArray(user.dashboard_shortcuts) ? user.dashboard_shortcuts : DEFAULT_ROUTES;
    return { routes: [...new Set(routes.filter((route): route is string => typeof route === 'string' && this.allowed(route, effective)))] };
  }

  async save(userId: number, routes: string[]) {
    const effective = await this.permissions.getEffectiveFresh(userId);
    const selected = [...new Set(routes)];
    if (selected.some((route) => !Object.prototype.hasOwnProperty.call(this.routeMap, route) || route === '/dashboard')) {
      throw new BadRequestException('اختر صفحة متاحة من قائمة الوصول السريع');
    }
    if (selected.some((route) => !this.allowed(route, effective))) {
      throw new ForbiddenException('إحدى الصفحات لم تعد ضمن صلاحياتك. حدّث القائمة وحاول مرة أخرى.');
    }
    await this.prisma.users.update({ where: { user_id: userId }, data: { dashboard_shortcuts: selected } });
    return { routes: selected };
  }
}
