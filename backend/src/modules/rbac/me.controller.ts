import { Controller, Get, NotFoundException, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtUser } from '../../common/types/jwt-user';
import { MenuService } from './menu.service';
import { WorkspaceService } from './workspace.service';
import { WorkspaceWidgetsService } from './workspace-widgets.service';
import { PermissionEngineService } from './engine/permission-engine.service';
import { buildRouteMap, RESOURCE_TREE, ResourceNode } from './catalog/rbac.catalog';

interface NavNode {
  key: string;
  nameAr: string;
  nameEn: string | null;
  route: string | null;
  icon: string | null;
  type: ResourceNode['type'];
  clickable: boolean;
  children: NavNode[];
}

@UseGuards(JwtAuthGuard)
@Controller('me')
export class MeController {
  constructor(
    private readonly menuService: MenuService,
    private readonly workspaceService: WorkspaceService,
    private readonly workspaceWidgetsService: WorkspaceWidgetsService,
    private readonly prisma: PrismaService,
    private readonly engine: PermissionEngineService,
  ) {}

  /** Fresh profile from DB (avatar/name may have changed since token issue). */
  @Get()
  async profile(@CurrentUser() user: JwtUser) {
    const row = await this.prisma.users.findUnique({
      where: { user_id: user.sub },
      select: {
        user_id: true,
        username: true,
        name: true,
        email: true,
        level: true,
        image: true,
        branch_id_fk: true,
        emp_code: true,
      },
    });
    if (!row) throw new NotFoundException();
    return { ...row, branch: user.branch, man_women_type: user.man_women_type };
  }

  /** The recursive, permission-filtered sidebar tree (same data as legacy). */
  @Get('menu')
  menu(@CurrentUser('sub') userId: number) {
    return this.menuService.getMenu(userId);
  }

  /**
   * Enterprise RBAC: the user's resolved permission set + route→resource map.
   * The frontend uses `keys` for can()/UI-gating and `routeMap` for the route guard.
   */
  @Get('permissions')
  async permissions(@CurrentUser('sub') userId: number) {
    const eff = await this.engine.getEffective(userId);
    return {
      superAdmin: eff.superAdmin,
      keys: [...eff.keys],
      routeMap: buildRouteMap(),
      scope: Object.fromEntries(eff.scope),
    };
  }

  /** Role-aware landing route + dashboard widgets for the current user. */
  @Get('workspace')
  workspace(@CurrentUser('sub') userId: number) {
    return this.workspaceService.getWorkspace(userId);
  }

  /** Resolved widget payloads for the user's role workspace. */
  @Get('workspace/widgets')
  workspaceWidgets(@CurrentUser() user: JwtUser, @Query('branchId') branchId?: string) {
    const requested = branchId && branchId !== 'all' ? Number(branchId) : undefined;
    return this.workspaceWidgetsService.getWidgets(user, requested);
  }

  /** Filtered navigation tree (modules→pages) the user has effective View on. */
  @Get('nav')
  async nav(@CurrentUser('sub') userId: number): Promise<NavNode[]> {
    const eff = await this.engine.getEffective(userId);
    const has = (key: string) => eff.superAdmin || eff.keys.has(`${key}:view`);

    const build = (nodes: ResourceNode[]): NavNode[] => {
      const out: NavNode[] = [];
      for (const n of nodes) {
        if (!n) continue;
        const children = build(n.children ?? []);
        const selfView = has(n.key);
        // include if the user can view this node OR any descendant (pass-through heading)
        if (selfView || children.length) {
          out.push({
            key: n.key,
            nameAr: n.nameAr,
            nameEn: n.nameEn ?? null,
            route: n.route ?? null,
            icon: n.icon ?? null,
            type: n.type,
            clickable: selfView && !!n.route,
            children,
          });
        }
      }
      return out;
    };

    return build(RESOURCE_TREE);
  }
}
