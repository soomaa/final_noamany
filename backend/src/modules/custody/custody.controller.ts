import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtUser } from '../../common/types/jwt-user';
import { CustodyService } from './custody.service';
import {
  CreateCustodyDto,
  ListCustodyDto,
  TransferCustodyDto,
  UpdateCustodyDto,
} from './dto/custody.dto';

@UseGuards(JwtAuthGuard)
@Controller('hr/custody')
@RequiresPermission('affairs.custody:view')
export class CustodyController {
  constructor(private readonly custody: CustodyService) {}

  @Get()
  list(@Query() query: ListCustodyDto) {
    return this.custody.list(query);
  }

  @Get('devices')
  listDevices() {
    return this.custody.listDevices();
  }

  @Get('transfers/:empCode')
  listTransfers(@Param('empCode', ParseIntPipe) empCode: number) {
    return this.custody.listTransfers(empCode);
  }

  @Post('transfer')
  @RequiresPermission('affairs.custody:update')
  transfer(@Body() dto: TransferCustodyDto, @CurrentUser() user: JwtUser) {
    return this.custody.transfer(dto, user.sub);
  }

  @Post()
  @RequiresPermission('affairs.custody:create')
  create(@Body() dto: CreateCustodyDto) {
    return this.custody.create(dto);
  }

  @Patch(':id')
  @RequiresPermission('affairs.custody:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCustodyDto) {
    return this.custody.update(id, dto);
  }

  @Patch(':id/return')
  @RequiresPermission('affairs.custody:update')
  returnItem(@Param('id', ParseIntPipe) id: number) {
    return this.custody.returnItem(id);
  }

  @Delete(':id')
  @RequiresPermission('affairs.custody:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.custody.remove(id);
  }
}
