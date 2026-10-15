import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { assertSystemAdmin } from '../../common/utils/system-admin.util';
import { JwtUser } from '../../common/types/jwt-user';
import { ClubSubscriptionTypesService } from './club-subscription-types.service';
import { ClubPackageCategoriesService } from './club-package-categories.service';

@UseGuards(JwtAuthGuard)
@Controller('club-subscription-types')
@RequiresPermission(
  'club.packages.settings:view',
  'club.subscriptions.list:view',
  'club.subscriptions.new:view',
  'club.subscriptions.special:view',
  'club.reception:view',
)
export class ClubSubscriptionTypesController {
  constructor(
    private readonly service: ClubSubscriptionTypesService,
    private readonly categories: ClubPackageCategoriesService,
  ) {}

  /** The section list the packages form offers as checkboxes (managed in the "الفئات" tab). */
  @Get('categories')
  async listCategories() {
    const rows = await this.categories.list();
    return rows.map((c) => ({
      key: c.key,
      labelAr: c.name,
      labelEn: c.nameEn ?? c.name,
      isActive: c.isActive,
      isSystem: c.isSystem,
    }));
  }

  @Get('all')
  listAll(@CurrentUser() user: JwtUser, @Query('branchId') branchId?: string) {
    return this.service.listActive(
      undefined,
      user,
      branchId && branchId !== 'all' ? Number(branchId) : undefined,
    );
  }

  @Get()
  list(
    @CurrentUser() user: JwtUser,
    @Query('isSpecialOffer') isSpecialOffer?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.service.listActive(
      isSpecialOffer,
      user,
      branchId && branchId !== 'all' ? Number(branchId) : undefined,
    );
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user);
  }

  @Post()
  @RequiresPermission('club.packages.settings:create')
  create(@Body() body: Record<string, unknown>, @CurrentUser() user: JwtUser) {
    return this.service.create(body, user);
  }

  @Put(':id')
  @RequiresPermission('club.packages.settings:update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.update(id, body, user);
  }

  @Put(':id/promo')
  @RequiresPermission('club.packages.settings:update')
  updatePromo(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.updatePromo(id, body, user);
  }

  @Delete(':id')
  @RequiresPermission('club.packages.settings:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    assertSystemAdmin(user);
    return this.service.remove(id);
  }
}
