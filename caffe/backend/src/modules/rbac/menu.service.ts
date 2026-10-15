import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface MenuNode {
  id: number;
  title: string;
  link: string;
  icon: string;
  order: number;
  bgColor: string | null;
  color: string | null;
  children: MenuNode[];
}

@Injectable()
export class MenuService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Reproduces the legacy recursive sidebar (Model_user_permission::get_my_page_permession):
   *  - roots  = the user's permission rows where page_level = 0
   *  - child  = pages where group_id_fk = parent.page_id AND page_id IN (user's granted ids)
   *  - order  = page_order ASC everywhere
   *  - skip nodes missing title/link/icon (legacy defensive filter)
   */
  async getMenu(userId: number): Promise<MenuNode[]> {
    const perms = await this.prisma.permissions.findMany({
      where: { user_id: userId },
      select: { page_id_fk: true, page_level: true },
    });
    if (perms.length === 0) return [];

    const grantedIds = perms.map((p) => p.page_id_fk);
    const rootIds = new Set(perms.filter((p) => p.page_level === 0).map((p) => p.page_id_fk));

    const pages = await this.prisma.pages.findMany({
      where: { page_id: { in: grantedIds } },
      orderBy: { page_order: 'asc' },
    });

    const byParent = new Map<number, typeof pages>();
    for (const pg of pages) {
      const arr = byParent.get(pg.group_id_fk) ?? [];
      arr.push(pg);
      byParent.set(pg.group_id_fk, arr);
    }

    const build = (pg: (typeof pages)[number]): MenuNode | null => {
      if (!pg.page_title || !pg.page_link || !pg.page_icon_code) return null;
      const children = (byParent.get(pg.page_id) ?? [])
        .map(build)
        .filter((n): n is MenuNode => n !== null);
      return {
        id: pg.page_id,
        title: pg.page_title,
        link: pg.page_link,
        icon: pg.page_icon_code,
        order: pg.page_order,
        bgColor: pg.bg_color ?? null,
        color: pg.color ?? null,
        children,
      };
    };

    return pages
      .filter((p) => rootIds.has(p.page_id))
      .map(build)
      .filter((n): n is MenuNode => n !== null);
  }
}
