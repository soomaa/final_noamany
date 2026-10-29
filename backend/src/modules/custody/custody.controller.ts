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
  list(@Query() query: ListCustodyDto, @CurrentUser() user: JwtUser) {
    return this.custody.list(query, user);
  }

  @Get('devices')
  listDevices() {
    return this.custody.listDevices();
  }

  @Get('transfers/:empCode')
  listTransfers(@Param('empCode', ParseIntPipe) empCode: number, @CurrentUser() user: JwtUser) {
    return this.custody.listTransfers(empCode, user);
  }

  @Post('transfer')
  @RequiresPermission('affairs.custody:update')
  transfer(@Body() dto: TransferCustodyDto, @CurrentUser() user: JwtUser) {
    return this.custody.transfer(dto, user.sub, user);
  }

  @Post()
  @RequiresPermission('affairs.custody:create')
  create(@Body() dto: CreateCustodyDto, @CurrentUser() user: JwtUser) {
    return this.custody.create(dto, user);
  }

  @Patch(':id')
  @RequiresPermission('affairs.custody:update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCustodyDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.custody.update(id, dto, user);
  }

  @Patch(':id/return')
  @RequiresPermission('affairs.custody:update')
  returnItem(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.custody.returnItem(id, user);
  }

  @Delete(':id')
  @RequiresPermission('affairs.custody:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.custody.remove(id, user);
  }
}
