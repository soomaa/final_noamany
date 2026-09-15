import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import type { JwtUser } from '../../common/types/jwt-user';
import { CafeWasteService } from './cafe-waste.service';
import {
  CafeWasteAnalyticsDto,
  CreateCafeWasteDto,
  CreateCafeWasteReasonDto,
  ListCafeWasteCatalogDto,
  ListCafeWasteRecordsDto,
  PreviewCafeWasteDto,
  ReverseCafeWasteDto,
  UpdateCafeWasteReasonDto,
} from './dto/cafe-waste.dto';

@UseGuards(JwtAuthGuard)
@Controller('cafe-waste')
@RequiresPermission('club.cafe.waste:view')
export class CafeWasteController {
  constructor(private readonly service: CafeWasteService) {}

  @Get('catalog')
  catalog(@Query() query: ListCafeWasteCatalogDto, @CurrentUser() user: JwtUser) {
    return this.service.catalog(query, user);
  }

  @Post('preview')
  preview(@Body() body: PreviewCafeWasteDto, @CurrentUser() user: JwtUser) {
    return this.service.preview(body, user);
  }

  @Get('reasons')
  reasons(@Query('includeInactive') includeInactive?: string) {
    return this.service.listReasons(includeInactive === 'true');
  }

  @Post('reasons')
  @RequiresPermission('club.cafe.waste:create')
  createReason(@Body() body: CreateCafeWasteReasonDto, @CurrentUser() user: JwtUser) {
    return this.service.createReason(body, user);
  }

  @Patch('reasons/:id')
  @RequiresPermission('club.cafe.waste:update')
  updateReason(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateCafeWasteReasonDto) {
    return this.service.updateReason(id, body);
  }

  @Get('analytics')
  analytics(@Query() query: CafeWasteAnalyticsDto, @CurrentUser() user: JwtUser) {
    return this.service.analytics(query, user);
  }

  @Get('records')
  records(@Query() query: ListCafeWasteRecordsDto, @CurrentUser() user: JwtUser) {
    return this.service.listRecords(query, user);
  }

  @Post('records')
  @RequiresPermission('club.cafe.waste:create')
  create(@Body() body: CreateCafeWasteDto, @CurrentUser() user: JwtUser) {
    return this.service.create(body, user);
  }

  @Post('records/:id/reverse')
  @RequiresPermission('club.cafe.waste:create')
  reverse(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ReverseCafeWasteDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.reverse(id, body, user);
  }
}

