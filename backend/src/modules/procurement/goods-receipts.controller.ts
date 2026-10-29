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
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtUser } from '../../common/types/jwt-user';
import {
  ChangeGoodsReceiptStatusDto,
  ListGoodsReceiptsDto,
  UpsertGoodsReceiptDto,
} from './dto/procurement-ext.dto';
import { isDryRun } from '../../common/preview';
import { GoodsReceiptsService } from './goods-receipts.service';

@UseGuards(JwtAuthGuard)
@Controller('goods-receipts')
@RequiresPermission('gym-sales.procurement:view')
export class GoodsReceiptsController {
  constructor(private readonly service: GoodsReceiptsService) {}

  @Get()
  list(@Query() query: ListGoodsReceiptsDto, @CurrentUser() user: JwtUser) {
    return this.service.list(query, user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user);
  }

  @Post()
  @RequiresPermission('gym-sales.procurement:create')
  create(@Body() body: UpsertGoodsReceiptDto, @CurrentUser() user: JwtUser) {
    return this.service.create(body, user);
  }

  @Put(':id')
  @RequiresPermission('gym-sales.procurement:update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Partial<UpsertGoodsReceiptDto>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.update(id, body, user);
  }

  @Patch(':id/status')
  @RequiresPermission('gym-sales.procurement:approve')
  changeStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ChangeGoodsReceiptStatusDto,
    @CurrentUser() user: JwtUser,
    @Query('dryRun') dryRun?: string,
  ) {
    return this.service.changeStatus(id, body, user, isDryRun(dryRun));
  }

  @Delete(':id')
  @RequiresPermission('gym-sales.procurement:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.remove(id, user);
  }
}
