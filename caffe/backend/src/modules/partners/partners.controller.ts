import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { ListPartnersDto, UpsertPartnerDto } from './dto/partners.dto';
import { PartnersService } from './partners.service';

@Controller('hr/partners')
@RequiresPermission('hr.partners:view')
export class PartnersController {
  constructor(private readonly partners: PartnersService) {}

  @Get()
  list(@Query() query: ListPartnersDto) {
    return this.partners.list(query);
  }

  @Get('options')
  options(@Query('search') search?: string) {
    return this.partners.options(search);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.partners.findOne(id);
  }

  @Post()
  @RequiresPermission('hr.partners:create')
  create(@Body() body: UpsertPartnerDto, @CurrentUser('sub') userId: number) {
    return this.partners.create(body, userId);
  }

  @Put(':id')
  @RequiresPermission('hr.partners:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: UpsertPartnerDto) {
    return this.partners.update(id, body);
  }

  @Delete(':id')
  @RequiresPermission('hr.partners:delete')
  deactivate(@Param('id', ParseIntPipe) id: number) {
    return this.partners.deactivate(id);
  }
}
