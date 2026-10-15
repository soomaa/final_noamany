import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtUser } from '../../common/types/jwt-user';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CafeBundlesService } from './cafe-bundles.service';
import { UpsertCafeBundleDto } from './dto/upsert-cafe-bundle.dto';
import { UpdateCafeProductStatusDto } from './dto/update-cafe-product-status.dto';

@UseGuards(JwtAuthGuard)
@Controller('cafe-bundles')
@RequiresPermission(
  'club.cafe.bundles:view',
  'gym-sales.sales.new_receipt:view',
)
export class CafeBundlesController {
  constructor(private readonly service: CafeBundlesService) {}

  @Get()
  @RequiresPermission('club.cafe.bundles:view', 'gym-sales.sales.new_receipt:view', 'gym-sales.sales.drafts:update')
  list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
    @Query('isActive') isActive?: string,
  ) {
    return this.service.list({
      page: Math.max(1, Number(page ?? 1)),
      pageSize: Math.max(1, Math.min(100, Number(pageSize ?? 20))),
      search: search?.trim() || undefined,
      isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
    });
  }

  @Get('next-code')
  @RequiresPermission('club.cafe.bundles:create')
  nextCode() {
    return this.service.nextBundleCode();
  }

  @Get(':id')
  @RequiresPermission('club.cafe.bundles:view', 'gym-sales.sales.new_receipt:view', 'gym-sales.sales.drafts:update')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequiresPermission('club.cafe.bundles:create')
  create(@Body() body: UpsertCafeBundleDto, @CurrentUser() user: JwtUser) {
    return this.service.create(body, user);
  }

  @Put(':id')
  @RequiresPermission('club.cafe.bundles:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: UpsertCafeBundleDto) {
    return this.service.update(id, body);
  }

  @Patch(':id/status')
  @RequiresPermission('club.cafe.bundles:update')
  updateStatus(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateCafeProductStatusDto) {
    return this.service.updateStatus(id, body.isActive);
  }

  @Delete(':id')
  @RequiresPermission('club.cafe.bundles:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
