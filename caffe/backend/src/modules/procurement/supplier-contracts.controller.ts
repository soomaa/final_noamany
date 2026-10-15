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
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { ListSupplierContractsDto, UpsertSupplierContractDto } from './dto/procurement-ext.dto';
import { SupplierContractsService } from './supplier-contracts.service';

@UseGuards(JwtAuthGuard)
@Controller('supplier-contracts')
@RequiresPermission('gym-sales.procurement:view')
export class SupplierContractsController {
  constructor(private readonly service: SupplierContractsService) {}

  @Get()
  list(@Query() query: ListSupplierContractsDto) {
    return this.service.list(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequiresPermission('gym-sales.procurement:create')
  create(@Body() body: UpsertSupplierContractDto) {
    return this.service.create(body);
  }

  @Patch(':id')
  @RequiresPermission('gym-sales.procurement:update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Partial<UpsertSupplierContractDto>,
  ) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @RequiresPermission('gym-sales.procurement:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
