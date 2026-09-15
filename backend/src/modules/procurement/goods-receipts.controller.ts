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
  list(@Query() query: ListGoodsReceiptsDto) {
    return this.service.list(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequiresPermission('gym-sales.procurement:create')
  create(@Body() body: UpsertGoodsReceiptDto, @CurrentUser('sub') userId: number) {
    return this.service.create(body, userId);
  }

  @Put(':id')
  @RequiresPermission('gym-sales.procurement:update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Partial<UpsertGoodsReceiptDto>,
  ) {
    return this.service.update(id, body);
  }

  @Patch(':id/status')
  @RequiresPermission('gym-sales.procurement:approve')
  changeStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ChangeGoodsReceiptStatusDto,
    @CurrentUser('sub') userId: number,
    @Query('dryRun') dryRun?: string,
  ) {
    return this.service.changeStatus(id, body, userId, isDryRun(dryRun));
  }

  @Delete(':id')
  @RequiresPermission('gym-sales.procurement:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
